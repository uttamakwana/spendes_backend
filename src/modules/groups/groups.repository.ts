import { type FilterQuery, Types } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { GroupKind, GroupMemberStatus, MemberConsent } from './groups.enums';
import { GroupModel, type GroupDocument } from './groups.model';

/**
 * Data access for groups. Adds membership-scoped lookups (a user can only see/act
 * on groups they actively belong to) and the placeholder-linking update used when a
 * previously-invited phone number registers.
 */
export class GroupsRepository extends BaseRepository<GroupDocument> {
  constructor() {
    super(GroupModel);
  }

  /** Filter matching the active groups a user is a current (non-removed) member of. */
  buildMemberFilter(userId: string): FilterQuery<GroupDocument> {
    return {
      isActive: true,
      members: {
        $elemMatch: {
          userId: new Types.ObjectId(userId),
          status: { $ne: GroupMemberStatus.Removed },
        },
      },
    } as FilterQuery<GroupDocument>;
  }

  /** Fetches a group only if `userId` is an active member; throws 404 otherwise. */
  findForMemberOrThrow(groupId: string, userId: string): Promise<GroupDocument> {
    return this.findOneOrThrow({
      _id: groupId,
      ...this.buildMemberFilter(userId),
    } as FilterQuery<GroupDocument>);
  }

  /** Every active 1-on-1 friendship (direct group) the user belongs to. */
  findDirectForUser(userId: string): Promise<GroupDocument[]> {
    return this.find({
      kind: GroupKind.Direct,
      ...this.buildMemberFilter(userId),
    } as FilterQuery<GroupDocument>);
  }

  /**
   * Finds the existing direct friendship between `userId` and `friend` (matched by
   * linked account, or by phone for an unregistered placeholder), or null. Used to
   * de-duplicate so adding the same friend twice reuses the one friendship.
   */
  findDirectBetween(
    userId: string,
    friend: { userId?: Types.ObjectId; dialCode?: string; phoneNumber?: string },
  ): Promise<GroupDocument | null> {
    const friendMatch = friend.userId
      ? { userId: friend.userId, status: { $ne: GroupMemberStatus.Removed } }
      : { dialCode: friend.dialCode, phoneNumber: friend.phoneNumber, userId: { $exists: false } };

    return this.findOne({
      kind: GroupKind.Direct,
      isActive: true,
      $and: [
        {
          members: {
            $elemMatch: {
              userId: new Types.ObjectId(userId),
              status: { $ne: GroupMemberStatus.Removed },
            },
          },
        },
        { members: { $elemMatch: friendMatch } },
      ],
    } as FilterQuery<GroupDocument>);
  }

  /**
   * Every active group that has an invited-by-phone placeholder for `(dialCode,
   * phoneNumber)`. Captured just before {@link linkInvitedMembersByPhone} runs so the
   * newcomer can be told (and given a chance to dispute) what they're inheriting.
   */
  findInvitedGroupsByPhone(dialCode: string, phoneNumber: string): Promise<GroupDocument[]> {
    return this.find({
      isActive: true,
      members: {
        $elemMatch: {
          dialCode,
          phoneNumber,
          userId: { $exists: false },
          status: GroupMemberStatus.Invited,
        },
      },
    } as FilterQuery<GroupDocument>);
  }

  /**
   * Promotes every invited-by-phone placeholder matching `(dialCode, phoneNumber)`
   * to an active membership linked to `userId`, across all groups. Called once when
   * that phone registers. Returns how many memberships were linked.
   */
  async linkInvitedMembersByPhone(
    dialCode: string,
    phoneNumber: string,
    userId: string,
    displayName: string,
  ): Promise<number> {
    const result = await this.model
      .updateMany(
        { members: { $elemMatch: { dialCode, phoneNumber, userId: { $exists: false } } } },
        {
          $set: {
            'members.$[m].userId': new Types.ObjectId(userId),
            'members.$[m].status': GroupMemberStatus.Active,
            'members.$[m].displayName': displayName,
          },
        },
        {
          arrayFilters: [
            {
              'm.dialCode': dialCode,
              'm.phoneNumber': phoneNumber,
              'm.userId': { $exists: false },
            },
          ],
        },
      )
      .exec();

    return result.modifiedCount ?? 0;
  }

  /**
   * Records how a member feels about being in this group/friendship. Consent never
   * gates anything (the balances are real either way) — it drives the "someone
   * added you, is this right?" surface in the app.
   *
   * `onlyIfPending` is how *implicit* confirmation works: paying, settling, or
   * adding your own expense here upgrades a pending membership to confirmed, but
   * must never quietly overwrite a deliberate `Declined`.
   */
  async setMemberConsent(
    groupId: string,
    userId: string,
    consent: MemberConsent,
    options: { onlyIfPending?: boolean } = {},
  ): Promise<boolean> {
    const memberFilter: Record<string, unknown> = { 'm.userId': new Types.ObjectId(userId) };
    if (options.onlyIfPending) {
      memberFilter['m.consent'] = MemberConsent.Pending;
    }

    const result = await this.model
      .updateOne(
        { _id: new Types.ObjectId(groupId) },
        { $set: { 'members.$[m].consent': consent } },
        { arrayFilters: [memberFilter] },
      )
      .exec();

    return (result.modifiedCount ?? 0) > 0;
  }
}

/** Shared singleton instance used across the app. */
export const groupsRepository = new GroupsRepository();
