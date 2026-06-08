import { type FilterQuery, Types } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { GroupMemberStatus } from './groups.enums';
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
}

/** Shared singleton instance used across the app. */
export const groupsRepository = new GroupsRepository();
