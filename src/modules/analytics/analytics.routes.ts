import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { authenticate } from '../auth/auth.middleware';
import { getCashflow, getGoalFeasibility, getOverview } from './analytics.controller';
import { cashflowQuerySchema } from './analytics.validation';

export const analyticsRouter: Router = Router();

// Every analytics route requires authentication; all reads are scoped to the caller.
analyticsRouter.use(authenticate);

analyticsRouter.get('/overview', getOverview);
analyticsRouter.get('/cashflow', validate({ query: cashflowQuerySchema }), getCashflow);
analyticsRouter.get('/goals', getGoalFeasibility);
