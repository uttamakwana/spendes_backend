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

/**
 * Whether a member has actually acknowledged being in this group/friendship.
 *
 * Spendes is deliberately frictionless: adding someone and splitting with them
 * takes effect immediately (no accept/reject gate at the dinner table). Consent is
 * therefore recorded *alongside* the membership rather than in front of it — the
 * balance is real either way, but the added person gets one clear moment to say
 * "yes, this is me / this is right" or push back.
 *
 * - `Confirmed` — they created it, or acknowledged it (confirmed, paid, settled,
 *                 or added an expense of their own here).
 * - `Pending`   — someone else added them and they haven't responded yet.
 * - `Declined`  — they said they don't recognise this person/group. Non-blocking:
 *                 nothing is deleted, the other side is simply told.
 *
 * A member document written before this field existed reads as `undefined` and is
 * treated as {@link MemberConsent.Confirmed} — old relationships are never
 * retroactively turned into pending requests (see `resolveMemberConsent`).
 */
export enum MemberConsent {
  Confirmed = 'confirmed',
  Pending = 'pending',
  Declined = 'declined',
}
