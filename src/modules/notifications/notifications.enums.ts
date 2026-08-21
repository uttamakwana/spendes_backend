/**
 * The kinds of in-app notification Spendes raises. These power the activity inbox —
 * a frictionless, non-blocking awareness layer over the social engine: splits and
 * friendships take effect immediately, but the other party is always told and can
 * either confirm it or push back (dispute) rather than being silently bound.
 *
 * - `FriendAdded`        — someone added you as a friend. Reviewable.
 * - `SplitAdded`         — someone added you to a split (group or 1-on-1). Reviewable.
 * - `SettlementRecorded` — someone recorded a payment between the two of you.
 * - `SplitDisputed`      — someone flagged a split you created (the dispute reply).
 * - `MembershipInherited`— a group/friendship (and its balances) was waiting for you
 *                          when you registered, from before you joined. Reviewable.
 * - `ConnectionConfirmed`— someone you added confirmed you / a split you added (the
 *                          reply that closes the loop for the person who started it).
 * - `ConnectionDeclined` — someone you added says they don't recognise you.
 */
export enum NotificationType {
  FriendAdded = 'friend_added',
  SplitAdded = 'split_added',
  SettlementRecorded = 'settlement_recorded',
  SplitDisputed = 'split_disputed',
  MembershipInherited = 'membership_inherited',
  ConnectionConfirmed = 'connection_confirmed',
  ConnectionDeclined = 'connection_declined',
}

/**
 * Why the recipient thinks a split/connection is wrong. Captured so the reply to
 * whoever added it is actionable ("wrong amount" is a fix; "I don't know them" is
 * a mis-typed phone number) instead of a bare "someone flagged something".
 *
 * `DontKnowThem` is the only reason that also declines the connection itself.
 */
export enum DisputeReason {
  NotMine = 'not_mine',
  WrongAmount = 'wrong_amount',
  AlreadyPaid = 'already_paid',
  DontKnowThem = 'dont_know_them',
  Other = 'other',
}
