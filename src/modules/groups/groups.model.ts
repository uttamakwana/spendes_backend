import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';
import { GroupKind, GroupMemberStatus, GroupRole, MemberConsent } from './groups.enums';

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
  /**
   * Whether this member has acknowledged the group/friendship. Absent on documents
   * written before consent existed — read it through {@link resolveMemberConsent},
   * never directly, so legacy members stay {@link MemberConsent.Confirmed}.
   */
  consent?: MemberConsent;
  joinedAt: Date;
}

/** Reads a member's consent, treating pre-consent (legacy) members as confirmed. */
export function resolveMemberConsent(member?: Pick<GroupMember, 'consent'> | null): MemberConsent {
  return member?.consent ?? MemberConsent.Confirmed;
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
  /** Normal group vs. a 1-on-1 direct friendship (hidden from the groups list). */
  kind: GroupKind;
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
    // Deliberately no default: an absent value means "written before consent
    // existed" and resolves to Confirmed. New members set it explicitly.
    consent: { type: String, enum: Object.values(MemberConsent) },
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
    kind: { type: String, enum: Object.values(GroupKind), default: GroupKind.Standard },
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
