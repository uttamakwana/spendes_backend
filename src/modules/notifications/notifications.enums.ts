/**
 * The kinds of in-app notification Spendes raises. These power the activity inbox —
 * a frictionless, non-blocking awareness layer over the social engine: splits and
 * friendships take effect immediately, but the other party is always told and can
 * push back (dispute) rather than being silently bound.
 *
 * - `FriendAdded`        — someone added you as a friend.
 * - `SplitAdded`         — someone added you to a split (group or 1-on-1). Disputable.
 * - `SettlementRecorded` — someone recorded a payment between the two of you.
 * - `SplitDisputed`      — someone flagged a split you created (the dispute reply).
 * - `MembershipInherited`— a group/friendship (and its balances) was waiting for you
 *                          when you registered, from before you joined. Disputable.
 */
export enum NotificationType {
  FriendAdded = 'friend_added',
  SplitAdded = 'split_added',
  SettlementRecorded = 'settlement_recorded',
  SplitDisputed = 'split_disputed',
  MembershipInherited = 'membership_inherited',
}
