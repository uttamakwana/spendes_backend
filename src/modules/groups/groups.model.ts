import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';
import { GroupMemberStatus, GroupRole } from './groups.enums';

/**
 * One membership inside a group, stored as an embedded subdocument with its own
 * stable `_id`. Splits reference this `_id` (not a `userId`), so a member who was
 * invited by phone before joining Spendes can still be owed/owe money. `userId` is
 * absent for such {@link GroupMemberStatus.Invited} placeholders and is filled in
 * when that phone registers (see `GroupsService.linkInvitesForUser`).
 */
export interface GroupMember {
  _id: Types.ObjectId;
  /** Linked account; absent for invited-by-phone placeholders. */
  userId?: Types.ObjectId;
  dialCode?: string;
  phoneNumber?: string;
  displayName: string;
  role: GroupRole;
  status: GroupMemberStatus;
  joinedAt: Date;
}

/**
 * A shared space (flatmates, a trip, a couple, the office lunch crew) that scopes
 * expenses and "who owes whom". Members are embedded because a group has a bounded
 * membership and we almost always load them together. Every read/write is scoped to
 * an active membership (see {@link GroupsService}); archiving sets `isActive=false`
 * rather than deleting, so split history survives.
 */
export interface GroupDocument extends BaseDocument {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  avatarUrl?: string;
  currency: string;
  createdBy: Types.ObjectId;
  members: GroupMember[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const groupMemberSchema = new Schema<GroupMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    dialCode: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    displayName: { type: String, required: true, trim: true },
    role: { type: String, enum: Object.values(GroupRole), default: GroupRole.Member },
    status: {
      type: String,
      enum: Object.values(GroupMemberStatus),
      default: GroupMemberStatus.Active,
    },
    joinedAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const groupSchema = new Schema<GroupDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    avatarUrl: { type: String, trim: true },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    members: { type: [groupMemberSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'groups' },
);

// Find every group a user belongs to (the primary list query).
groupSchema.index({ 'members.userId': 1 });

// Link invited-by-phone placeholders to an account when that phone registers.
groupSchema.index({ 'members.dialCode': 1, 'members.phoneNumber': 1 });

export const GroupModel = model<GroupDocument>('Group', groupSchema);
