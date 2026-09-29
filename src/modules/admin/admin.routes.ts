import { Router } from 'express';
import { Role } from '../../common/enums/role';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { paginationQuerySchema } from '../../common/utils/pagination';
import { authenticate } from '../auth/auth.middleware';
import * as c from './admin.controller';
import {
  broadcastSchema,
  bulkWaitlistSchema,
  categoryUsageQuerySchema,
  clearOtpSchema,
  listAuditQuerySchema,
  listAuthEventsQuerySchema,
  listDisputesQuerySchema,
  listExpensesQuerySchema,
  listGroupActivityQuerySchema,
  listGroupsQuerySchema,
  listIncomeQuerySchema,
  listInsightsQuerySchema,
  listNotificationsQuerySchema,
  listPlanningQuerySchema,
  listPushTokensQuerySchema,
  listUsersQuerySchema,
  listWaitlistQuerySchema,
  notifyUserSchema,
  timeseriesQuerySchema,
  updateGroupSchema,
  updateUserSchema,
  updateWaitlistSchema,
} from './admin.validation';

/**
 * The back-office API. Every route requires an authenticated user holding the
 * `admin` role; every mutation writes an audit-log row (see `audit/`).
 */
export const adminRouter: Router = Router();

adminRouter.use(authenticate, authorize(Role.Admin));

const byId = validate({ params: idParamSchema });

// Session & overview
adminRouter.get('/session', c.getSession);
adminRouter.get('/stats', c.getOverview);
adminRouter.get('/stats/breakdowns', c.getBreakdowns);
adminRouter.get('/stats/timeseries', validate({ query: timeseriesQuerySchema }), c.getTimeseries);

// Users
adminRouter.get('/users', validate({ query: listUsersQuerySchema }), c.listUsers);
adminRouter.get('/users/:id', byId, c.getUser);
adminRouter.get('/users/:id/overview', byId, c.getUserOverview);
adminRouter.get('/users/:id/delete-preview', byId, c.previewDeleteUser);
adminRouter.get('/users/:id/export', byId, c.exportUser);
adminRouter.patch(
  '/users/:id',
  validate({ params: idParamSchema, body: updateUserSchema }),
  c.updateUser,
);
adminRouter.post('/users/:id/revoke-sessions', byId, c.revokeUserSessions);
adminRouter.post(
  '/users/:id/notify',
  validate({ params: idParamSchema, body: notifyUserSchema }),
  c.notifyUser,
);
adminRouter.delete('/users/:id', byId, c.deleteUser);

// Money
adminRouter.get('/expenses', validate({ query: listExpensesQuerySchema }), c.listExpenses);
adminRouter.get('/expenses/:id', byId, c.getExpense);
adminRouter.delete('/expenses/:id', byId, c.deleteExpense);
adminRouter.get('/income', validate({ query: listIncomeQuerySchema }), c.listIncome);
adminRouter.delete('/income/:id', byId, c.deleteIncome);
adminRouter.get('/planning/stats', c.getPlanningStats);
for (const resource of ['budgets', 'emis', 'goals', 'investments'] as const) {
  adminRouter.get(
    `/${resource}`,
    validate({ query: listPlanningQuerySchema }),
    c.listPlanning(resource),
  );
}

// Social
adminRouter.get('/groups', validate({ query: listGroupsQuerySchema }), c.listGroups);
adminRouter.get('/groups/:id', byId, c.getGroup);
adminRouter.patch(
  '/groups/:id',
  validate({ params: idParamSchema, body: updateGroupSchema }),
  c.updateGroup,
);
adminRouter.get(
  '/group-expenses',
  validate({ query: listGroupActivityQuerySchema }),
  c.listGroupExpenses,
);
adminRouter.get(
  '/settlements',
  validate({ query: listGroupActivityQuerySchema }),
  c.listSettlements,
);
adminRouter.get('/disputes/stats', c.getDisputeStats);
adminRouter.get('/disputes', validate({ query: listDisputesQuerySchema }), c.listDisputes);

// Engagement
adminRouter.get(
  '/notifications',
  validate({ query: listNotificationsQuerySchema }),
  c.listNotifications,
);
adminRouter.delete('/notifications/:id', byId, c.deleteNotification);
adminRouter.get('/broadcasts', validate({ query: paginationQuerySchema }), c.listBroadcasts);
adminRouter.post('/broadcasts', validate({ body: broadcastSchema }), c.sendBroadcast);
adminRouter.get('/push-tokens', validate({ query: listPushTokensQuerySchema }), c.listPushTokens);
adminRouter.delete('/push-tokens/:id', byId, c.deletePushToken);
adminRouter.get('/ai/stats', c.getAiStats);
adminRouter.get('/insights', validate({ query: listInsightsQuerySchema }), c.listInsights);
adminRouter.get('/insights/:id', byId, c.getInsight);

// Platform
adminRouter.get('/waitlist', validate({ query: listWaitlistQuerySchema }), c.listWaitlist);
adminRouter.get('/waitlist/sources', c.getWaitlistSources);
adminRouter.post('/waitlist/bulk', validate({ body: bulkWaitlistSchema }), c.bulkWaitlist);
adminRouter.patch(
  '/waitlist/:id',
  validate({ params: idParamSchema, body: updateWaitlistSchema }),
  c.updateWaitlist,
);
adminRouter.delete('/waitlist/:id', byId, c.deleteWaitlist);
adminRouter.get(
  '/categories/usage',
  validate({ query: categoryUsageQuerySchema }),
  c.getCategoryUsage,
);
adminRouter.get('/auth-events/stats', c.getAuthStats);
adminRouter.get('/auth-events', validate({ query: listAuthEventsQuerySchema }), c.listAuthEvents);
adminRouter.get('/otp', c.listPendingOtps);
adminRouter.delete('/otp', validate({ body: clearOtpSchema }), c.clearOtp);
adminRouter.get('/system', c.getSystem);

// Audit
adminRouter.get('/audit-logs/actions', c.listAuditActions);
adminRouter.get('/audit-logs', validate({ query: listAuditQuerySchema }), c.listAuditLogs);
