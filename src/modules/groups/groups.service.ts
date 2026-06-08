import { Types, type UpdateQuery } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/errors/http-exception';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { phoneService } from '../auth/phone/phone.service';
import { usersService } from '../users/users.service';
import type { UserDocument } from '../users/users.model';
import { GroupKind, GroupMemberStatus, GroupRole } from './groups.enums';
import { toGroupResponse, type GroupResponse } from './group-response';
import type { GroupDocument, GroupMember } from './groups.model';
import { groupsRepository, GroupsRepository } from './groups.repository';
import type {
  CreateGroupInput,
  ListGroupsQuery,
  MemberInviteInput,
  UpdateGroupInput,
} from './groups.validation';

/**
 * Business logic for groups. Every read/write is scoped to an *active* membership:
 * the repository's member filter means a non-member's request 404s (never revealing
 * the group exists), and admin-only actions (rename, manage members, archive) are
 * checked here. Members are mutated with a load-modify-write on the embedded array,
 * which is safe given a group's small, rarely-concurrent membership.
 */
export class GroupsService {
  private readonly logger = createLogger('GroupsService');

  constructor(private readonly repository: GroupsRepository) {}

  async create(userId: string, dto: CreateGroupInput): Promise<GroupResponse> {
    const creator = await usersService.findEntityById(userId);
    if (!creator) {
      throw new NotFoundException('User not found');
    }

    const members: GroupMember[] = [this.buildCreatorMember(creator)];
    for (const invite of dto.members ?? []) {
      const member = await this.resolveInvitee(invite);
      if (this.isDuplicate(members, member)) {
        continue; // silently skip dupes (incl. inviting the creator)
      }
      members.push(member);
    }

    const group = await this.repository.create({
      name: dto.name,
      description: dto.description,
      avatarUrl: dto.avatarUrl,
      currency: dto.currency?.toUpperCase() ?? creator.defaultCurrency ?? 'INR',
      createdBy: creator._id,
      members,
      isActive: true,
    });

    this.logger.info(`Group created: ${group._id.toString()} by user ${userId}`);
    return toGroupResponse(group, userId);
  }

  async findAll(userId: string, query: ListGroupsQuery): Promise<PaginatedData<GroupResponse>> {
    const result = await this.repository.paginate({
      // Exclude 1-on-1 direct friendships ($ne also matches legacy docs without `kind`).
      filter: { ...this.repository.buildMemberFilter(userId), kind: { $ne: GroupKind.Direct } },
      page: query.page,
      limit: query.limit,
      sort: buildSort(query) ?? { updatedAt: -1 },
    });

    return paginate(
      result.items.map((group) => toGroupResponse(group, userId)),
      { page: result.page, limit: result.limit, totalItems: result.totalItems },
    );
  }

  async findById(userId: string, id: string): Promise<GroupResponse> {
    const group = await this.repository.findForMemberOrThrow(id, userId);
    return toGroupResponse(group, userId);
  }

  async update(userId: string, id: string, dto: UpdateGroupInput): Promise<GroupResponse> {
    const group = await this.repository.findForMemberOrThrow(id, userId);
    this.assertAdmin(group, userId);

    const update: UpdateQuery<GroupDocument> = { ...dto };
    if (dto.currency) {
      update.currency = dto.currency.toUpperCase();
    }

    const updated = await this.repository.updateById(id, update);
    return toGroupResponse(updated, userId);
  }

  async remove(userId: string, id: string): Promise<void> {
    const group = await this.repository.findForMemberOrThrow(id, userId);
    this.assertAdmin(group, userId);
    await this.repository.updateById(id, { isActive: false });
    this.logger.info(`Group archived: ${id} by user ${userId}`);
  }

  async addMember(userId: string, groupId: string, dto: MemberInviteInput): Promise<GroupResponse> {
    const group = await this.repository.findForMemberOrThrow(groupId, userId);
    if (group.kind === GroupKind.Direct) {
      throw new BadRequestException('You cannot add members to a 1-on-1 friendship');
    }
    this.assertAdmin(group, userId);

    const member = await this.resolveInvitee(dto);
    if (this.isDuplicate(this.presentMembers(group), member)) {
      throw new ConflictException('That person is already in the group');
    }

    const updated = await this.repository.updateById(groupId, {
      members: [...group.members, member],
    });
    this.logger.info(`Member added to group ${groupId} by user ${userId}`);
    return toGroupResponse(updated, userId);
  }

  async updateMemberRole(
    userId: string,
    groupId: string,
    memberId: string,
    role: GroupRole,
  ): Promise<GroupResponse> {
    const group = await this.repository.findForMemberOrThrow(groupId, userId);
    this.assertAdmin(group, userId);

    const target = this.findPresentMember(group, memberId);
    if (
      role === GroupRole.Member &&
      target.role === GroupRole.Admin &&
      this.adminCount(group) <= 1
    ) {
      throw new BadRequestException('A group must keep at least one admin');
    }

    const members = group.members.map((m) => (m._id.toString() === memberId ? { ...m, role } : m));
    const updated = await this.repository.updateById(groupId, { members });
    return toGroupResponse(updated, userId);
  }

  async removeMember(userId: string, groupId: string, memberId: string): Promise<GroupResponse> {
    const group = await this.repository.findForMemberOrThrow(groupId, userId);
    const target = this.findPresentMember(group, memberId);

    // Admins can remove anyone; a non-admin may only remove themselves (i.e. leave).
    const isSelf = target.userId?.toString() === userId;
    if (!isSelf) {
      this.assertAdmin(group, userId);
    }

    // Don't strand a group without an admin while other members remain.
    if (
      target.role === GroupRole.Admin &&
      this.adminCount(group) <= 1 &&
      this.presentMembers(group).length > 1
    ) {
      throw new BadRequestException(
        'Promote another member to admin before removing the last admin',
      );
    }

    const members = group.members.map((m) =>
      m._id.toString() === memberId ? { ...m, status: GroupMemberStatus.Removed } : m,
    );
    const update: UpdateQuery<GroupDocument> = { members };

    // If nobody is left, archive the group too.
    const stillPresent = members.filter((m) => m.status !== GroupMemberStatus.Removed);
    if (stillPresent.length === 0) {
      update.isActive = false;
    }

    const updated = await this.repository.updateById(groupId, update);
    return toGroupResponse(updated, userId);
  }

  /**
   * Promotes any invited-by-phone placeholders for this user's number to real
   * memberships. Called right after registration; never throws (a failure here must
   * not break sign-up — the invite simply stays a placeholder until next time).
   */
  async linkInvitesForUser(user: UserDocument): Promise<void> {
    try {
      const displayName = `${user.firstName} ${user.lastName}`.trim();
      const linked = await this.repository.linkInvitedMembersByPhone(
        user.dialCode,
        user.phoneNumber,
        user._id.toString(),
        displayName,
      );
      if (linked > 0) {
        this.logger.info(`Linked ${linked} group invite(s) to user ${user._id.toString()}`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to link group invites for ${user._id.toString()}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Finds the existing 1-on-1 friendship (direct group) between the caller and the
   * invited person, or creates one. Reuses the group machinery so direct splits get
   * the full splits engine. Used by the friends module — see FriendsService.
   */
  async findOrCreateDirect(
    userId: string,
    invite: MemberInviteInput,
  ): Promise<{ group: GroupDocument; created: boolean }> {
    const creator = await usersService.findEntityById(userId);
    if (!creator) {
      throw new NotFoundException('User not found');
    }

    const friend = await this.resolveInvitee(invite);
    if (friend.userId && friend.userId.toString() === userId) {
      throw new BadRequestException('You cannot add yourself as a friend');
    }

    const existing = await this.repository.findDirectBetween(userId, {
      userId: friend.userId,
      dialCode: friend.dialCode,
      phoneNumber: friend.phoneNumber,
    });
    if (existing) {
      return { group: existing, created: false };
    }

    const group = await this.repository.create({
      name: friend.displayName,
      currency: creator.defaultCurrency ?? 'INR',
      kind: GroupKind.Direct,
      createdBy: creator._id,
      members: [this.buildCreatorMember(creator), friend],
      isActive: true,
    });
    this.logger.info(`Direct friendship created: ${group._id.toString()} by user ${userId}`);
    return { group, created: true };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private buildCreatorMember(user: UserDocument): GroupMember {
    return {
      _id: new Types.ObjectId(),
      userId: user._id,
      dialCode: user.dialCode,
      phoneNumber: user.phoneNumber,
      displayName: `${user.firstName} ${user.lastName}`.trim(),
      role: GroupRole.Admin,
      status: GroupMemberStatus.Active,
      joinedAt: new Date(),
    };
  }

  /** Turns an invite into a member: a real user (active) or a phone placeholder (invited). */
  private async resolveInvitee(invite: MemberInviteInput): Promise<GroupMember> {
    const base = {
      _id: new Types.ObjectId(),
      role: invite.role ?? GroupRole.Member,
      joinedAt: new Date(),
    };

    if (invite.userId) {
      const user = await usersService.findEntityById(invite.userId);
      if (!user) {
        throw new NotFoundException('User to add was not found');
      }
      return {
        ...base,
        userId: user._id,
        dialCode: user.dialCode,
        phoneNumber: user.phoneNumber,
        displayName: invite.displayName ?? `${user.firstName} ${user.lastName}`.trim(),
        status: GroupMemberStatus.Active,
      };
    }

    const phone = phoneService.normalize({
      dialCode: invite.dialCode,
      phoneNumber: invite.phoneNumber as string,
    });
    const existing = await usersService.findByPhone(phone.dialCode, phone.phoneNumber);
    if (existing) {
      return {
        ...base,
        userId: existing._id,
        dialCode: phone.dialCode,
        phoneNumber: phone.phoneNumber,
        displayName: invite.displayName ?? `${existing.firstName} ${existing.lastName}`.trim(),
        status: GroupMemberStatus.Active,
      };
    }

    return {
      ...base,
      dialCode: phone.dialCode,
      phoneNumber: phone.phoneNumber,
      displayName: invite.displayName ?? phone.phoneNumber,
      status: GroupMemberStatus.Invited,
    };
  }

  /** True if `candidate` is already represented among `members` (by account or phone). */
  private isDuplicate(members: GroupMember[], candidate: GroupMember): boolean {
    return members.some((m) => {
      if (candidate.userId && m.userId && m.userId.toString() === candidate.userId.toString()) {
        return true;
      }
      return Boolean(
        candidate.phoneNumber &&
        m.phoneNumber === candidate.phoneNumber &&
        m.dialCode === candidate.dialCode,
      );
    });
  }

  private presentMembers(group: GroupDocument): GroupMember[] {
    return group.members.filter((m) => m.status !== GroupMemberStatus.Removed);
  }

  private findPresentMember(group: GroupDocument, memberId: string): GroupMember {
    const member = this.presentMembers(group).find((m) => m._id.toString() === memberId);
    if (!member) {
      throw new NotFoundException('Group member not found');
    }
    return member;
  }

  private adminCount(group: GroupDocument): number {
    return this.presentMembers(group).filter((m) => m.role === GroupRole.Admin).length;
  }

  /** Asserts the user is an active admin of the group; throws 403 otherwise. */
  private assertAdmin(group: GroupDocument, userId: string): void {
    const isAdmin = this.presentMembers(group).some(
      (m) => m.userId?.toString() === userId && m.role === GroupRole.Admin,
    );
    if (!isAdmin) {
      throw new ForbiddenException('Only a group admin can perform this action');
    }
  }
}

/** Shared singleton instance used across the app. */
export const groupsService = new GroupsService(groupsRepository);
