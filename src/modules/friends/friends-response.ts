/**
 * Public shape of a friend (a 1-on-1 friendship). `friendshipId` is the underlying
 * direct group's id — used for the friend's expenses/settlements routes. `net` is
 * the caller's position with this friend in major units: positive = the friend owes
 * you, negative = you owe the friend. The `*MemberId`s identify the two parties in
 * the direct expenses/splits (you supply them as `paidBy`/`splits` member ids).
 */
export interface FriendResponse {
  friendshipId: string;
  myMemberId: string;
  friendMemberId: string;
  displayName: string;
  userId?: string;
  isRegistered: boolean;
  dialCode?: string;
  phoneNumber?: string;
  currency: string;
  net: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Result of `GET /friends`: every friend plus the headline owed/owe totals. */
export interface FriendsListResponse {
  friends: FriendResponse[];
  /** Sum of positive balances — total others owe you across friends. */
  totalYouAreOwed: number;
  /** Sum of negative balances — total you owe across friends. */
  totalYouOwe: number;
  /** `totalYouAreOwed - totalYouOwe`. */
  net: number;
}
