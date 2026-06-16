import { Router, type Request, type Response } from 'express';
import { config } from './config';
import { sendSuccess } from './common/utils/response';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { expensesRouter } from './modules/expenses/expenses.routes';
import { incomeRouter } from './modules/income/income.routes';
import { groupsRouter } from './modules/groups/groups.routes';
import { splitsRouter } from './modules/splits/splits.routes';
import { friendsRouter } from './modules/friends/friends.routes';
import { budgetsRouter } from './modules/budgets/budgets.routes';
import { emisRouter } from './modules/emis/emis.routes';
import { goalsRouter } from './modules/goals/goals.routes';
import { investmentsRouter } from './modules/investments/investments.routes';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { pushRouter } from './modules/push/push.routes';
import { waitlistRouter } from './modules/waitlist/waitlist.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { healthRouter } from './health/health.routes';

export interface AppInfo {
  name: string;
  version: string;
  environment: string;
  apiVersion: string;
  docs: string;
}

/** GET /api/v1 — API metadata and links. */
function getInfo(req: Request, res: Response): void {
  const info: AppInfo = {
    name: config.app.name,
    version: process.env.npm_package_version ?? '0.1.0',
    environment: config.app.env,
    apiVersion: `v${config.app.apiVersion}`,
    docs: config.swagger.enabled ? `/${config.swagger.path}` : 'disabled',
  };
  sendSuccess(res, req, info, 'Welcome to the Spendes API');
}

/**
 * The versioned API router, mounted by `app.ts` at `/<prefix>/v<version>`
 * (e.g. `/api/v1`). Add new feature routers here.
 */
export const apiRouter: Router = Router();

apiRouter.get('/', getInfo);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/expenses', expensesRouter);
apiRouter.use('/income', incomeRouter);
apiRouter.use('/groups', groupsRouter);
// Group-scoped splits (expenses, balances, settlements). Mounted after the groups
// router so the bare `/groups/:id` routes match first; deeper paths fall through.
apiRouter.use('/groups/:groupId', splitsRouter);
apiRouter.use('/friends', friendsRouter);
apiRouter.use('/budgets', budgetsRouter);
apiRouter.use('/emis', emisRouter);
apiRouter.use('/goals', goalsRouter);
apiRouter.use('/investments', investmentsRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/push', pushRouter);
apiRouter.use('/waitlist', waitlistRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/health', healthRouter);
