import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { analyticsService } from './analytics.service';
import type { CashflowQuery } from './analytics.validation';

/** GET /analytics/overview — this month's snapshot + standing balances. */
export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const overview = await analyticsService.overview(req.user!.id);
  sendSuccess(res, req, overview, 'Analytics overview retrieved successfully');
});

/** GET /analytics/cashflow — income vs expense across the trailing months. */
export const getCashflow = asyncHandler(async (req: Request, res: Response) => {
  const { months } = req.query as unknown as CashflowQuery;
  const cashflow = await analyticsService.cashflow(req.user!.id, months);
  sendSuccess(res, req, cashflow, 'Cash-flow trend retrieved successfully');
});
