import { GroupKind, GroupMemberStatus, type GroupRole } from './groups.enums';
import type { GroupDocument, GroupMember } from './groups.model';

/** Public shape of a single group member. */
export interface GroupMemberResponse {
  id: string;
  userId?: string;
  displayName: string;
  role: GroupRole;
  status: GroupMemberStatus;
  dialCode?: string;
  phoneNumber?: string;
  /** True for the member that maps to the requesting user. */
  isYou: boolean;
  /** False while this is still an invited-by-phone placeholder. */
  isRegistered: boolean;
  joinedAt: Date;
}

/**
 * Public shape of a group. Built via {@link toGroupResponse} so ObjectIds become
 * strings and the persistence model stays decoupled. `myRole` reflects the
 * requesting user's role; removed members are omitted and `memberCount` counts only
 * the ones still in the group.
 */
export interface GroupResponse {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  currency: string;
  kind: GroupKind;
  createdBy: string;
  members: GroupMemberResponse[];
  memberCount: number;
  myRole?: GroupRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toMemberResponse(member: GroupMember, viewerUserId?: string): GroupMemberResponse {
  const userId = member.userId?.toString();
  return {
    id: member._id.toString(),
    userId,
    displayName: member.displayName,
    role: member.role,
    status: member.status,
    dialCode: member.dialCode,
    phoneNumber: member.phoneNumber,
    isYou: Boolean(userId && viewerUserId && userId === viewerUserId),
    isRegistered: Boolean(userId),
    joinedAt: member.joinedAt,
  };
}

/** Maps a raw group document to its public response shape for the given viewer. */
export function toGroupResponse(group: GroupDocument, viewerUserId?: string): GroupResponse {
  const present = group.members.filter((m) => m.status !== GroupMemberStatus.Removed);
  const mine = viewerUserId
    ? present.find((m) => m.userId?.toString() === viewerUserId)
    : undefined;

  return {
    id: group._id.toString(),
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
    currency: group.currency,
    kind: group.kind ?? GroupKind.Standard,
    createdBy: group.createdBy.toString(),
    members: present.map((m) => toMemberResponse(m, viewerUserId)),
    memberCount: present.length,
    myRole: mine?.role,
    isActive: group.isActive,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}
