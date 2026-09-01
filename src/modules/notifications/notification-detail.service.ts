import { createLogger } from '../../logger';
import { GroupKind, GroupMemberStatus } from '../groups/groups.enums';
import type { GroupDocument, GroupMember } from '../groups/groups.model';
import { resolveMemberConsent } from '../groups/groups.model';
import { groupsRepository } from '../groups/groups.repository';
import type { GroupBalancesResponse, GroupExpenseResponse } from '../splits/split-response';
import { splitsService } from '../splits/splits.service';
import { paymentsService } from '../payments/payments.service';
import { usersService } from '../users/users.service';
import type { NotificationDocument } from './notification.model';
import {
  toNotificationResponse,
  type NotificationActions,
  type NotificationActorSummary,
  type NotificationConnectionSummary,
  type NotificationDetailResponse,
  type NotificationExpenseSummary,
  type NotificationResponse,
} from './notification-response';
import { notificationsRepository } from './notifications.repository';

/**
 * Assembles the "someone added you to a split — is this right?" review screen.
 *
 * It lives apart from `NotificationsService` on purpose: the splits engine *emits*
 * notifications, so the emitting service can never import it back. Only the
 * controller reaches for this reader, which keeps the dependency arrow one-way.
 *
 * Everything the recipient needs to answer honestly is resolved here — who this
 * person actually is, the bill and their slice of it, where the running balance
 * stands, and which of pay / mark-paid / confirm / flag are genuinely available —
 * so the screen is one request and never offers a button that would fail.
 */
export class NotificationDetailService {
  private readonly logger = createLogger('NotificationDetailService');

  async getDetail(userId: string, id: string): Promise<NotificationDetailResponse> {
    const notification = await notificationsRepository.findOwnedByIdOrThrow(id, userId);

    // Opening the review screen *is* reading it — no extra round trip from the client.
    if (!notification.isRead) {
      void notificationsRepository.markRead(id, userId).catch(() => undefined);
      notification.isRead = true;
    }

    const base = toNotificationResponse(notification);
    const group = await this.loadGroup(notification, userId);

    if (!group) {
      return { ...base, actions: this.emptyActions(base) };
    }

    const me = group.members.find((m) => m.userId?.toString() === userId);
    const other = this.otherParty(group, me, notification);
    const [expense, balances] = await Promise.all([
      this.loadExpense(notification, userId, group),
      this.loadBalances(userId, group),
    ]);

    const myNet = balances?.myNet ?? 0;

    return {
      ...base,
      actor: await this.buildActor(notification, other),
      connection: this.buildConnection(group, me, other, userId),
      expense: expense ? this.buildExpense(expense, group, me) : undefined,
      balance: { myNet, currency: group.currency },
      actions: await this.buildActions(base, group, me, other, myNet, balances),
    };
  }

  // --- Loaders ---------------------------------------------------------------

  /** The group/friendship behind the notification, if the recipient is still in it. */
  private async loadGroup(
    notification: NotificationDocument,
    userId: string,
  ): Promise<GroupDocument | null> {
    if (!notification.groupId) return null;
    try {
      return await groupsRepository.findForMemberOrThrow(notification.groupId.toString(), userId);
    } catch {
      // Removed from the group, or it was archived — the notification still reads fine.
      return null;
    }
  }

  private async loadExpense(
    notification: NotificationDocument,
    userId: string,
    group: GroupDocument,
  ): Promise<GroupExpenseResponse | null> {
    if (!notification.groupExpenseId) return null;
    try {
      return await splitsService.getExpense(
        userId,
        group._id.toString(),
        notification.groupExpenseId.toString(),
      );
    } catch {
      // Deleted since — the reviewer should see the connection, not a 404.
      return null;
    }
  }

  private async loadBalances(
    userId: string,
    group: GroupDocument,
  ): Promise<GroupBalancesResponse | null> {
    try {
      return await splitsService.getBalances(userId, group._id.toString());
    } catch (error) {
      this.logger.warn(`Failed to load balances for review: ${(error as Error).message}`);
      return null;
    }
  }

  // --- Builders --------------------------------------------------------------

  /**
   * The person on the other side. Prefers whoever triggered the notification; falls
   * back to the only other member of a friendship (an inherited membership has no
   * actor, but it still has an obvious counterpart).
   */
  private otherParty(
    group: GroupDocument,
    me: GroupMember | undefined,
    notification: NotificationDocument,
  ): GroupMember | undefined {
    const present = group.members.filter((m) => m.status !== GroupMemberStatus.Removed);
    const actorId = notification.actorUserId?.toString();
    const byActor = actorId ? present.find((m) => m.userId?.toString() === actorId) : undefined;
    if (byActor) return byActor;
    if (group.kind === GroupKind.Direct) {
      return present.find((m) => m._id.toString() !== me?._id.toString());
    }
    return undefined;
  }

  private buildConnection(
    group: GroupDocument,
    me: GroupMember | undefined,
    other: GroupMember | undefined,
    userId: string,
  ): NotificationConnectionSummary {
    const isDirect = group.kind === GroupKind.Direct;
    return {
      id: group._id.toString(),
      isDirect,
      name: isDirect ? (other?.displayName ?? group.name) : group.name,
      consent: resolveMemberConsent(me),
      addedByThem: group.createdBy.toString() !== userId,
      memberCount: group.members.filter((m) => m.status !== GroupMemberStatus.Removed).length,
      myMemberId: me?._id.toString(),
      otherMemberId: other?._id.toString(),
      createdAt: group.createdAt,
    };
  }

  /** Identity, so "who is this?" has a real answer: name, photo and the number they used. */
  private async buildActor(
    notification: NotificationDocument,
    other: GroupMember | undefined,
  ): Promise<NotificationActorSummary | undefined> {
    const userId = notification.actorUserId?.toString() ?? other?.userId?.toString();
    const name = notification.actorName ?? other?.displayName;
    if (!userId && !name) return undefined;

    const user = userId ? await usersService.findEntityById(userId) : null;
    return {
      userId,
      name: user ? `${user.firstName} ${user.lastName}`.trim() : (name ?? 'Someone'),
      avatarUrl: user?.avatarUrl,
      dialCode: user?.dialCode ?? other?.dialCode,
      phoneNumber: user?.phoneNumber ?? other?.phoneNumber,
      isRegistered: Boolean(user),
    };
  }

  private buildExpense(
    expense: GroupExpenseResponse,
    group: GroupDocument,
    me: GroupMember | undefined,
  ): NotificationExpenseSummary {
    const nameOf = (memberId: string): string =>
      group.members.find((m) => m._id.toString() === memberId)?.displayName ?? 'Someone';

    return {
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      currency: expense.currency,
      myShare: me ? (expense.splits.find((s) => s.memberId === me._id.toString())?.amount ?? 0) : 0,
      paidByName: expense.paidBy.map((p) => nameOf(p.memberId)).join(', ') || 'Someone',
      splitStrategy: expense.splitStrategy,
      splitCount: expense.splits.length,
      category: expense.category,
      notes: expense.notes,
      spentAt: expense.spentAt,
    };
  }

  /**
   * Which buttons the review screen may show. Paying needs a real payee with a UPI
   * id on file, so we resolve that here rather than letting the client find out by
   * hitting a 400 mid-flow.
   */
  private async buildActions(
    base: NotificationResponse,
    group: GroupDocument,
    me: GroupMember | undefined,
    other: GroupMember | undefined,
    myNet: number,
    balances: GroupBalancesResponse | null,
  ): Promise<NotificationActions> {
    const actions: NotificationActions = {
      canConfirm: base.canConfirm,
      canDispute: base.canDispute,
      canPay: false,
      canMarkPaid: false,
      payAmount: 0,
      payerMemberId: me?._id.toString(),
    };

    // Nothing to settle unless the reviewer is actually the one who owes.
    if (!me || myNet >= 0) {
      return actions;
    }

    // Who to settle with: the friend in a 1-on-1, otherwise the transfer the balance
    // engine already suggests for me (preferring the person who added the split).
    const payee =
      group.kind === GroupKind.Direct ? other : this.suggestedPayee(group, balances, me, other);
    if (!payee) {
      return actions;
    }

    const amount =
      group.kind === GroupKind.Direct
        ? Math.abs(myNet)
        : (balances?.suggestedTransfers.find(
            (transfer) =>
              transfer.fromMemberId === me._id.toString() &&
              transfer.toMemberId === payee._id.toString(),
          )?.amount ?? Math.abs(myNet));

    actions.payAmount = amount;
    actions.payeeMemberId = payee._id.toString();
    actions.canMarkPaid = amount > 0;

    if (!payee.userId) {
      actions.payBlockedReason = `${this.firstName(payee)} hasn't joined Spendes yet`;
      return actions;
    }

    const payeeUser = await usersService.findEntityById(payee.userId.toString());
    const handle = payeeUser?.paymentHandle;
    if (handle?.value && paymentsService.canPay(handle.type, group.currency)) {
      actions.canPay = amount > 0;
      actions.payRailLabel = paymentsService.railLabel(handle.type);
    } else if (handle?.value && paymentsService.isLinkable(handle.type)) {
      // Their rail exists but can't carry this group's currency — no conversion here.
      actions.payBlockedReason = `${paymentsService.railLabel(handle.type)} can't settle a ${group.currency} balance`;
    } else if (handle?.value) {
      // A handle we can't deep-link into: still worth showing, just not as a button.
      actions.payBlockedReason = `${this.firstName(payee)} takes payment at ${handle.value}`;
    } else {
      actions.payBlockedReason = `${this.firstName(payee)} hasn't added a way to be paid yet`;
    }

    return actions;
  }

  /** In a multi-person group, the member the balance engine says I should pay. */
  private suggestedPayee(
    group: GroupDocument,
    balances: GroupBalancesResponse | null,
    me: GroupMember,
    other: GroupMember | undefined,
  ): GroupMember | undefined {
    const mine = (balances?.suggestedTransfers ?? []).filter(
      (transfer) => transfer.fromMemberId === me._id.toString(),
    );
    const preferred =
      mine.find((transfer) => transfer.toMemberId === other?._id.toString()) ?? mine[0];
    if (!preferred) return undefined;
    return group.members.find((m) => m._id.toString() === preferred.toMemberId);
  }

  private firstName(member: GroupMember): string {
    return member.displayName.split(' ')[0] ?? member.displayName;
  }

  private emptyActions(base: NotificationResponse): NotificationActions {
    return {
      canConfirm: base.canConfirm,
      canDispute: base.canDispute,
      canPay: false,
      canMarkPaid: false,
      payAmount: 0,
    };
  }
}

/** Shared singleton instance used across the app. */
export const notificationDetailService = new NotificationDetailService();
