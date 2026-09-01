import { createLogger } from '../../logger';
import { GroupKind, GroupMemberStatus } from '../groups/groups.enums';
import type { GroupDocument, GroupMember } from '../groups/groups.model';
import { groupsRepository } from '../groups/groups.repository';
import { paymentsService } from '../payments/payments.service';
import { computeNetBalances, simplifyDebts } from '../splits/split-calculator';
import type { GroupExpenseDocument } from '../splits/group-expense.model';
import type { SettlementDocument } from '../splits/settlement.model';
import { groupExpensesRepository, settlementsRepository } from '../splits/splits.repository';
import { usersService } from '../users/users.service';
import type { UserDocument } from '../users/users.model';
import type { BalanceSource, BalancesSummaryResponse, PersonBalance } from './balance-response';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** A person's identity for netting: their account if they have one, else their number. */
function identityOf(member: GroupMember): string {
  if (member.userId) return `user:${member.userId.toString()}`;
  if (member.dialCode && member.phoneNumber) return `phone:${member.dialCode}${member.phoneNumber}`;
  return `member:${member._id.toString()}`;
}

interface Accumulator {
  identity: string;
  member: GroupMember;
  currency: string;
  net: number;
  sources: BalanceSource[];
  friendshipId?: string;
}

/**
 * Rolls every balance the user has into one answer per person.
 *
 * The friends list alone was never the whole picture — money you fronted inside a
 * group is just as owed to you as money you fronted one-on-one, and someone can owe
 * you in a flat while you owe them from a trip. This nets those together so
 * "how much do I owe Rahul" has a single number, with the groups it came from
 * attached.
 *
 * Two things worth knowing about the arithmetic. Within a multi-person group there
 * is no such thing as a raw "you owe Rahul" — everyone owes the group — so this
 * uses the same simplified transfers the group screen suggests, which can name
 * someone you never directly transacted with. And nothing is converted: balances
 * only combine within one currency, so a dollar friendship is reported separately
 * rather than folded into a rupee total.
 */
export class BalancesService {
  private readonly logger = createLogger('BalancesService');

  async summary(userId: string): Promise<BalancesSummaryResponse> {
    const [user, groups] = await Promise.all([
      usersService.findEntityById(userId),
      groupsRepository.find(groupsRepository.buildMemberFilter(userId)),
    ]);
    const homeCurrency = user?.defaultCurrency ?? 'INR';

    const groupIds = groups.map((g) => g._id.toString());
    // Two queries for everything, rather than a pair per group.
    const [expenses, settlements] = await Promise.all([
      groupExpensesRepository.findAllForGroups(groupIds),
      settlementsRepository.findAllForGroups(groupIds),
    ]);
    const expensesByGroup = groupBy(expenses, (e) => e.groupId.toString());
    const settlementsByGroup = groupBy(settlements, (s) => s.groupId.toString());

    const byIdentity = new Map<string, Accumulator>();
    for (const group of groups) {
      this.accumulateGroup(
        group,
        userId,
        expensesByGroup.get(group._id.toString()) ?? [],
        settlementsByGroup.get(group._id.toString()) ?? [],
        byIdentity,
      );
    }

    const people = await Promise.all(
      [...byIdentity.values()]
        .filter((entry) => Math.abs(entry.net) >= 0.01)
        .map((entry) => this.toPerson(entry)),
    );
    people.sort((a, b) => b.net - a.net);

    const home = people.filter((p) => p.currency === homeCurrency);
    const youAreOwed = home.filter((p) => p.net > 0).reduce((sum, p) => sum + p.net, 0);
    const youOwe = home.filter((p) => p.net < 0).reduce((sum, p) => sum - p.net, 0);

    return {
      currency: homeCurrency,
      youAreOwed: round2(youAreOwed),
      youOwe: round2(youOwe),
      net: round2(youAreOwed - youOwe),
      people: home,
      otherCurrency: people.filter((p) => p.currency !== homeCurrency),
    };
  }

  // --- Internals -------------------------------------------------------------

  /** Adds one group's simplified transfers involving the user into the roll-up. */
  private accumulateGroup(
    group: GroupDocument,
    userId: string,
    expenses: GroupExpenseDocument[],
    settlements: SettlementDocument[],
    byIdentity: Map<string, Accumulator>,
  ): void {
    const me = group.members.find((m) => m.userId?.toString() === userId);
    if (!me) return;

    const memberIds = new Set(
      group.members
        .filter((m) => m.status !== GroupMemberStatus.Removed)
        .map((m) => m._id.toString()),
    );
    // A removed member can still carry a balance, so include anyone who appears.
    for (const expense of expenses) {
      expense.paidBy.forEach((p) => memberIds.add(p.memberId.toString()));
      expense.splits.forEach((s) => memberIds.add(s.memberId.toString()));
    }
    for (const settlement of settlements) {
      memberIds.add(settlement.fromMemberId.toString());
      memberIds.add(settlement.toMemberId.toString());
    }

    const net = computeNetBalances(
      [...memberIds],
      expenses.map((e) => ({
        paidBy: e.paidBy.map((p) => ({ memberId: p.memberId.toString(), amount: p.amount })),
        splits: e.splits.map((s) => ({ memberId: s.memberId.toString(), amount: s.amount })),
      })),
      settlements.map((s) => ({
        fromMemberId: s.fromMemberId.toString(),
        toMemberId: s.toMemberId.toString(),
        amount: s.amount,
      })),
    );

    const myMemberId = me._id.toString();
    const isDirect = group.kind === GroupKind.Direct;
    const membersById = new Map(group.members.map((m) => [m._id.toString(), m]));

    for (const transfer of simplifyDebts(net)) {
      const involvesMe = transfer.fromMemberId === myMemberId || transfer.toMemberId === myMemberId;
      if (!involvesMe) continue;

      const iPay = transfer.fromMemberId === myMemberId;
      const otherId = iPay ? transfer.toMemberId : transfer.fromMemberId;
      const other = membersById.get(otherId);
      if (!other) continue;

      const identity = identityOf(other);
      const amount = iPay ? -transfer.amount : transfer.amount;
      const existing = byIdentity.get(identity);
      const source: BalanceSource = {
        kind: isDirect ? 'friend' : 'group',
        id: group._id.toString(),
        name: isDirect ? other.displayName : group.name,
        net: round2(amount),
      };

      if (existing) {
        // Only ever net within one currency — see the class comment.
        if (existing.currency !== group.currency) {
          this.logger.debug(
            `Skipping ${group.currency} balance for a person already tracked in ${existing.currency}`,
          );
          continue;
        }
        existing.net = round2(existing.net + amount);
        existing.sources.push(source);
        if (isDirect) existing.friendshipId = group._id.toString();
      } else {
        byIdentity.set(identity, {
          identity,
          member: other,
          currency: group.currency,
          net: round2(amount),
          sources: [source],
          friendshipId: isDirect ? group._id.toString() : undefined,
        });
      }
    }
  }

  private async toPerson(entry: Accumulator): Promise<PersonBalance> {
    const user: UserDocument | null = entry.member.userId
      ? await usersService.findEntityById(entry.member.userId.toString())
      : null;
    const handle = user?.paymentHandle;

    return {
      userId: entry.member.userId?.toString(),
      name: entry.member.displayName,
      avatarUrl: user?.avatarUrl,
      dialCode: entry.member.dialCode,
      phoneNumber: entry.member.phoneNumber,
      currency: entry.currency,
      net: round2(entry.net),
      isRegistered: Boolean(entry.member.userId),
      paymentHandleType: handle?.type,
      canPayDirectly: handle ? paymentsService.canPay(handle.type, entry.currency) : false,
      friendshipId: entry.friendshipId,
      sources: entry.sources.sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    };
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Shared singleton instance used across the app. */
export const balancesService = new BalancesService();
