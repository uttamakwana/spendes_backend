/**
 * Distinguishes a normal multi-person group from a **direct** 1-on-1 friendship.
 * A `Direct` group always has exactly two members, has no real "group" identity,
 * and is hidden from the groups list — it is surfaced through the friends API
 * instead. Modeling a friendship as a 2-person group lets direct splits reuse the
 * entire splits engine (strategies, balances, settlements, share materialization).
 */
export enum GroupKind {
  Standard = 'standard',
  Direct = 'direct',
}

/**
 * A member's authority within a single group. This is group-scoped and separate
 * from the app-wide {@link Role} RBAC: the group creator starts as `Admin` (can
 * rename the group, add/remove members, change roles, archive it); everyone else
 * is a `Member`. A group must always keep at least one admin.
 */
export enum GroupRole {
  Admin = 'admin',
  Member = 'member',
}

/**
 * Lifecycle of a membership.
 * - `Active`   — a real, joined member (always has a linked `userId`).
 * - `Invited`  — a placeholder added by phone before that person joined Spendes;
 *                it auto-promotes to `Active` (with a `userId`) when they register.
 * - `Removed`  — soft-removed/left; retained so historical splits keep referencing it.
 */
export enum GroupMemberStatus {
  Active = 'active',
  Invited = 'invited',
  Removed = 'removed',
}
