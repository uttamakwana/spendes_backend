import { NotFoundException } from '../../common/errors/http-exception';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { GroupKind, GroupMemberStatus } from '../groups/groups.enums';
import type { GroupDocument } from '../groups/groups.model';
import { groupsRepository } from '../groups/groups.repository';
import { groupsService } from '../groups/groups.service';
import { splitsService } from '../splits/splits.service';
import type {
  GroupExpenseResponse,
  SettlementIntentResponse,
  SettlementResponse,
} from '../splits/split-response';
import type {
  CreateGroupExpenseInput,
  CreateSettlementInput,
  ListGroupItemsQuery,
  SettlementIntentInput,
} from '../splits/splits.validation';
import type { FriendResponse, FriendsListResponse } from './friends-response';
import type { AddFriendInput } from './friends.validation';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Friend-centric facade over the group/splits engine. A friendship is a 2-person
 * "direct" group, so direct splits, balances, settlements and personal-expense
 * materialization are reused wholesale — this service only adds the friend-shaped
 * API (add/list/get + thin delegations) and computes per-friend balances. A
 * friend's balance is **direct expenses only**: a direct group holds nothing but
 * its own 1-on-1 expenses, so its balance is inherently independent of any shared
 * standard groups.
 */
export class FriendsService {
  private readonly logger = createLogger('FriendsService');

  async addFriend(userId: string, dto: AddFriendInput): Promise<FriendResponse> {
    const { group, created } = await groupsService.findOrCreateDirect(userId, dto);
    if (created) {
      this.logger.info(`Friend added: friendship ${group._id.toString()} for user ${userId}`);
    }
    return this.toFriend(userId, group);
  }

  async listFriends(userId: string): Promise<FriendsListResponse> {
    const groups = await groupsRepository.findDirectForUser(userId);
    const friends: FriendResponse[] = [];
    for (const group of groups) {
      friends.push(await this.toFriend(userId, group));
    }

    const totalYouAreOwed = friends.filter((f) => f.net > 0).reduce((sum, f) => sum + f.net, 0);
    const totalYouOwe = friends.filter((f) => f.net < 0).reduce((sum, f) => sum - f.net, 0);

    return {
      friends,
      totalYouAreOwed: round2(totalYouAreOwed),
      totalYouOwe: round2(totalYouOwe),
      net: round2(totalYouAreOwed - totalYouOwe),
    };
  }

  async getFriend(userId: string, friendshipId: string): Promise<FriendResponse> {
    const group = await this.loadDirect(userId, friendshipId);
    return this.toFriend(userId, group);
  }

  // --- Direct expenses & settlements (delegated to the splits engine) ----------

  async createExpense(
    userId: string,
    friendshipId: string,
    dto: CreateGroupExpenseInput,
  ): Promise<GroupExpenseResponse> {
    await this.loadDirect(userId, friendshipId);
    return splitsService.createExpense(userId, friendshipId, dto);
  }

  async listExpenses(
    userId: string,
    friendshipId: string,
    query: ListGroupItemsQuery,
  ): Promise<PaginatedData<GroupExpenseResponse>> {
    await this.loadDirect(userId, friendshipId);
    return splitsService.listExpenses(userId, friendshipId, query);
  }

  async createSettlement(
    userId: string,
    friendshipId: string,
    dto: CreateSettlementInput,
  ): Promise<SettlementResponse> {
    await this.loadDirect(userId, friendshipId);
    return splitsService.createSettlement(userId, friendshipId, dto);
  }

  async buildSettlementIntent(
    userId: string,
    friendshipId: string,
    dto: SettlementIntentInput,
  ): Promise<SettlementIntentResponse> {
    await this.loadDirect(userId, friendshipId);
    return splitsService.buildSettlementIntent(userId, friendshipId, dto);
  }

  // --- Internals -------------------------------------------------------------

  /** Loads a friendship the caller belongs to; 404s if it isn't a direct group. */
  private async loadDirect(userId: string, friendshipId: string): Promise<GroupDocument> {
    const group = await groupsRepository.findForMemberOrThrow(friendshipId, userId);
    if (group.kind !== GroupKind.Direct) {
      throw new NotFoundException('Friend not found');
    }
    return group;
  }

  /** Builds the friend view of a direct group from the caller's perspective. */
  private async toFriend(userId: string, group: GroupDocument): Promise<FriendResponse> {
    const me = group.members.find((m) => m.userId?.toString() === userId);
    const friend = group.members.find(
      (m) => m._id.toString() !== me?._id.toString() && m.status !== GroupMemberStatus.Removed,
    );
    if (!me || !friend) {
      throw new NotFoundException('Friend not found');
    }

    const balances = await splitsService.getBalances(userId, group._id.toString());

    return {
      friendshipId: group._id.toString(),
      myMemberId: me._id.toString(),
      friendMemberId: friend._id.toString(),
      displayName: friend.displayName,
      userId: friend.userId?.toString(),
      isRegistered: Boolean(friend.userId),
      dialCode: friend.dialCode,
      phoneNumber: friend.phoneNumber,
      currency: group.currency,
      net: balances.myNet ?? 0,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}

/** Shared singleton instance used across the app. */
export const friendsService = new FriendsService();
