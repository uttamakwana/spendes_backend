import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { authenticate } from '../auth/auth.middleware';
import { balancesService } from './balances.service';

export const balancesRouter: Router = Router();

balancesRouter.use(authenticate);

/**
 * GET /balances — who owes whom across every friendship and group, netted per
 * person. This is the honest answer to "how much do I owe, and to whom": a total
 * built only from friendships would miss the rent you fronted for a flat.
 */
balancesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const summary = await balancesService.summary(req.user!.id);
    sendSuccess(res, req, summary, 'Balances retrieved successfully');
  }),
);
