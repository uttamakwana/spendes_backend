import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import type { PaginationQuery } from '../../common/utils/pagination';
import { sendSuccess } from '../../common/utils/response';
import { usersService } from '../users/users.service';
import type {
  BroadcastInput,
  BulkWaitlistInput,
  CategoryUsageQuery,
  ClearOtpInput,
  ListAuditQuery,
  ListAuthEventsQuery,
  ListDisputesQuery,
  ListExpensesQuery,
  ListGroupActivityQuery,
  ListGroupsQuery,
  ListIncomeQuery,
  ListInsightsQuery,
  ListNotificationsQuery,
  ListPlanningQuery,
  ListPushTokensQuery,
  ListUsersQuery,
  ListWaitlistQuery,
  NotifyUserInput,
  TimeseriesQuery,
  UpdateGroupInput,
  UpdateUserInput,
  UpdateWaitlistInput,
} from './admin.validation';
import { auditService } from './audit/audit.service';
import { adminEngagementService as engagement } from './services/engagement.service';
import { adminFinanceService as finance, type PlanningResource } from './services/finance.service';
import { adminPlatformService as platform } from './services/platform.service';
import { adminSocialService as social } from './services/social.service';
import { adminStatsService as stats } from './services/stats.service';
import { adminUsersService as users } from './services/users.service';

/** One-line handler: run `fn`, wrap its result in the success envelope. */
const handle = <T>(message: string, fn: (req: Request) => Promise<T>, status = 200) =>
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, req, await fn(req), message, status);
  });

/** Same, for deletes that answer 204 with no body. */
const noContent = (fn: (req: Request) => Promise<unknown>) =>
  asyncHandler(async (req: Request, res: Response) => {
    await fn(req);
    res.status(204).send();
  });

const id = (req: Request): string => req.params.id as string;
const q = <T>(req: Request): T => req.query as unknown as T;
const body = <T>(req: Request): T => req.body as T;

// Session ------------------------------------------------------------------

/** GET /admin/session — the signed-in admin (the panel calls this on boot). */
export const getSession = handle('Session retrieved', (req) => usersService.findById(req.user!.id));

// Overview -----------------------------------------------------------------

export const getOverview = handle('Overview retrieved', () => stats.overview());
export const getBreakdowns = handle('Breakdowns retrieved', () => stats.breakdowns());
export const getTimeseries = handle('Timeseries retrieved', (req) =>
  stats.timeseries(q<TimeseriesQuery>(req).days),
);

// Users --------------------------------------------------------------------

export const listUsers = handle('Users retrieved', (req) => users.list(q<ListUsersQuery>(req)));
export const getUser = handle('User retrieved', (req) => users.get(id(req)));
export const getUserOverview = handle('User overview retrieved', (req) => users.overview(id(req)));
export const updateUser = handle('User updated', (req) =>
  users.update(req, id(req), body<UpdateUserInput>(req)),
);
export const revokeUserSessions = handle('Sessions revoked', (req) =>
  users.revokeSessions(req, id(req)),
);
export const previewDeleteUser = handle('Delete preview', (req) => users.deletePreview(id(req)));
export const deleteUser = handle('User deleted', (req) => users.remove(req, id(req)));
export const notifyUser = handle('Message sent', (req) =>
  users.notify(req, id(req), body<NotifyUserInput>(req)),
);
export const exportUser = handle('User data exported', (req) => users.exportData(req, id(req)));

// Money --------------------------------------------------------------------

export const listExpenses = handle('Expenses retrieved', (req) =>
  finance.listExpenses(q<ListExpensesQuery>(req)),
);
export const getExpense = handle('Expense retrieved', (req) => finance.getExpense(id(req)));
export const deleteExpense = noContent((req) => finance.deleteExpense(req, id(req)));
export const listIncome = handle('Income retrieved', (req) =>
  finance.listIncome(q<ListIncomeQuery>(req)),
);
export const deleteIncome = noContent((req) => finance.deleteIncome(req, id(req)));
export const listPlanning = (resource: PlanningResource) =>
  handle(`${resource} retrieved`, (req) =>
    finance.listPlanning(resource, q<ListPlanningQuery>(req)),
  );
export const getPlanningStats = handle('Planning stats retrieved', () => finance.planningStats());

// Social -------------------------------------------------------------------

export const listGroups = handle('Groups retrieved', (req) =>
  social.listGroups(q<ListGroupsQuery>(req)),
);
export const getGroup = handle('Group retrieved', (req) => social.getGroup(id(req)));
export const updateGroup = handle('Group updated', (req) =>
  social.updateGroup(req, id(req), body<UpdateGroupInput>(req)),
);
export const listGroupExpenses = handle('Group expenses retrieved', (req) =>
  social.listGroupExpenses(q<ListGroupActivityQuery>(req)),
);
export const listSettlements = handle('Settlements retrieved', (req) =>
  social.listSettlements(q<ListGroupActivityQuery>(req)),
);
export const listDisputes = handle('Disputes retrieved', (req) =>
  social.listDisputes(q<ListDisputesQuery>(req)),
);
export const getDisputeStats = handle('Dispute stats retrieved', () => social.disputeStats());

// Engagement ---------------------------------------------------------------

export const listNotifications = handle('Notifications retrieved', (req) =>
  engagement.listNotifications(q<ListNotificationsQuery>(req)),
);
export const deleteNotification = noContent((req) => engagement.deleteNotification(req, id(req)));
export const sendBroadcast = handle('Broadcast processed', (req) =>
  engagement.broadcast(req, body<BroadcastInput>(req)),
);
export const listBroadcasts = handle('Broadcasts retrieved', (req) =>
  engagement.listBroadcasts(q<PaginationQuery>(req)),
);
export const listPushTokens = handle('Devices retrieved', (req) =>
  engagement.listPushTokens(q<ListPushTokensQuery>(req)),
);
export const deletePushToken = noContent((req) => engagement.deletePushToken(req, id(req)));
export const listInsights = handle('Insights retrieved', (req) =>
  engagement.listInsights(q<ListInsightsQuery>(req)),
);
export const getInsight = handle('Insight retrieved', (req) => engagement.getInsight(id(req)));
export const getAiStats = handle('AI stats retrieved', () => engagement.aiStats());

// Platform -----------------------------------------------------------------

export const listWaitlist = handle('Waitlist retrieved', (req) =>
  platform.listWaitlist(q<ListWaitlistQuery>(req)),
);
export const getWaitlistSources = handle('Waitlist sources retrieved', () =>
  platform.waitlistSources(),
);
export const updateWaitlist = handle('Waitlist entry updated', (req) =>
  platform.updateWaitlist(req, id(req), body<UpdateWaitlistInput>(req)),
);
export const deleteWaitlist = noContent((req) => platform.deleteWaitlist(req, id(req)));
export const bulkWaitlist = handle('Waitlist updated', (req) =>
  platform.bulkWaitlist(req, body<BulkWaitlistInput>(req)),
);
export const getCategoryUsage = handle('Category usage retrieved', (req) =>
  platform.categoryUsage(q<CategoryUsageQuery>(req)),
);
export const listAuthEvents = handle('Auth events retrieved', (req) =>
  platform.listAuthEvents(q<ListAuthEventsQuery>(req)),
);
export const getAuthStats = handle('Auth stats retrieved', () => platform.authStats());
export const listPendingOtps = handle('Pending codes retrieved', () => platform.pendingOtps());
export const clearOtp = handle('Codes cleared', (req) =>
  platform.clearOtp(req, body<ClearOtpInput>(req)),
);
export const getSystem = handle('System info retrieved', () => platform.system());

// Audit --------------------------------------------------------------------

export const listAuditLogs = handle('Audit log retrieved', (req) =>
  auditService.list(q<ListAuditQuery>(req)),
);
export const listAuditActions = handle('Audit actions retrieved', () => auditService.actions());
