/** Where one slice of a person-to-person balance came from. */
export interface BalanceSource {
  kind: 'friend' | 'group';
  id: string;
  name: string;
  /** Positive = they owe you within this group/friendship; negative = you owe them. */
  net: number;
}

/**
 * What one person owes you, or you owe them, across everything you share — the
 * 1-on-1 friendship *and* every group you're both in, netted together.
 */
export interface PersonBalance {
  /** Absent while they're an invited-by-phone placeholder. */
  userId?: string;
  name: string;
  avatarUrl?: string;
  dialCode?: string;
  phoneNumber?: string;
  currency: string;
  /** Positive = they owe you; negative = you owe them. */
  net: number;
  /** True once they've joined Spendes (so a Pay button can mean something). */
  isRegistered: boolean;
  /** The rail they're paid on, when they've set one. */
  paymentHandleType?: string;
  /** Whether that rail can carry this balance's currency — no conversion happens. */
  canPayDirectly: boolean;
  /** The friendship, if there is one — the natural place to settle up 1-on-1. */
  friendshipId?: string;
  /** Which groups/friendship this total is made of, largest first. */
  sources: BalanceSource[];
}

/**
 * The whole picture of who owes whom: every friendship and every group, rolled up
 * per person. This is what "how much do I owe, and to whom" actually means — a
 * balance that only counted friendships would miss the rent you fronted for a flat.
 *
 * Totals are lifetime, not this month: a debt from March is still a debt in
 * September. They cover the user's own currency only, since Spendes never converts;
 * people whose balance is in another currency are listed separately.
 */
export interface BalancesSummaryResponse {
  /** The currency the totals below are in — the user's own. */
  currency: string;
  /** Sum of everyone who owes you, in your currency. */
  youAreOwed: number;
  /** Sum of everyone you owe, in your currency (positive number). */
  youOwe: number;
  /** `youAreOwed - youOwe`. */
  net: number;
  /** Everyone with a non-zero balance, biggest debt to you first. */
  people: PersonBalance[];
  /** People whose balance is in another currency, listed but not added in. */
  otherCurrency: PersonBalance[];
}
