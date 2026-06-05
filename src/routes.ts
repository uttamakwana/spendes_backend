import { Router, type Request, type Response } from 'express';
import { config } from './config';
import { sendSuccess } from './common/utils/response';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { expensesRouter } from './modules/expenses/expenses.routes';
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
apiRouter.use('/health', healthRouter);
