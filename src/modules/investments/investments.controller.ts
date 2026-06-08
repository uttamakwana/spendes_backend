import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { investmentsService } from './investments.service';
import type {
  CreateInvestmentInput,
  ListInvestmentsQuery,
  UpdateInvestmentInput,
} from './investments.validation';

/** POST /investments — add a holding to the portfolio. */
export const createInvestment = asyncHandler(async (req: Request, res: Response) => {
  const investment = await investmentsService.create(
    req.user!.id,
    req.body as CreateInvestmentInput,
  );
  sendSuccess(res, req, investment, 'Investment created successfully', 201);
});

/** GET /investments — list holdings with gain/loss (paginated). */
export const listInvestments = asyncHandler(async (req: Request, res: Response) => {
  const page = await investmentsService.findAll(
    req.user!.id,
    req.query as unknown as ListInvestmentsQuery,
  );
  sendSuccess(res, req, page, 'Investments retrieved successfully');
});

/** GET /investments/summary — portfolio totals, gain/loss, and allocation by asset class. */
export const getInvestmentSummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await investmentsService.summary(req.user!.id);
  sendSuccess(res, req, summary, 'Investment summary retrieved successfully');
});

/** GET /investments/:id — fetch one holding with its gain/loss. */
export const getInvestment = asyncHandler(async (req: Request, res: Response) => {
  const investment = await investmentsService.findById(req.user!.id, req.params.id as string);
  sendSuccess(res, req, investment, 'Investment retrieved successfully');
});

/** PATCH /investments/:id — update a holding (typically its current value). */
export const updateInvestment = asyncHandler(async (req: Request, res: Response) => {
  const investment = await investmentsService.update(
    req.user!.id,
    req.params.id as string,
    req.body as UpdateInvestmentInput,
  );
  sendSuccess(res, req, investment, 'Investment updated successfully');
});

/** DELETE /investments/:id — remove a holding. */
export const deleteInvestment = asyncHandler(async (req: Request, res: Response) => {
  await investmentsService.remove(req.user!.id, req.params.id as string);
  res.status(204).send();
});
