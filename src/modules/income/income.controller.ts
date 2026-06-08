import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { incomeService } from './income.service';
import type {
  CreateIncomeInput,
  IncomeSummaryQuery,
  ListIncomeQuery,
  UpdateIncomeInput,
} from './income.validation';

/** POST /income — record a new income entry for the authenticated user. */
export const createIncome = asyncHandler(async (req: Request, res: Response) => {
  const income = await incomeService.create(req.user!.id, req.body as CreateIncomeInput);
  sendSuccess(res, req, income, 'Income created successfully', 201);
});

/** GET /income — list the authenticated user's income (paginated + filtered). */
export const listIncome = asyncHandler(async (req: Request, res: Response) => {
  const page = await incomeService.findAll(req.user!.id, req.query as unknown as ListIncomeQuery);
  sendSuccess(res, req, page, 'Income retrieved successfully');
});

/** GET /income/summary — income totals and breakdowns over an optional date window. */
export const getIncomeSummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await incomeService.summary(
    req.user!.id,
    req.query as unknown as IncomeSummaryQuery,
  );
  sendSuccess(res, req, summary, 'Income summary retrieved successfully');
});

/** GET /income/:id — fetch one of the authenticated user's income entries. */
export const getIncome = asyncHandler(async (req: Request, res: Response) => {
  const income = await incomeService.findById(req.user!.id, req.params.id as string);
  sendSuccess(res, req, income, 'Income retrieved successfully');
});

/** PATCH /income/:id — update one of the authenticated user's income entries. */
export const updateIncome = asyncHandler(async (req: Request, res: Response) => {
  const income = await incomeService.update(
    req.user!.id,
    req.params.id as string,
    req.body as UpdateIncomeInput,
  );
  sendSuccess(res, req, income, 'Income updated successfully');
});

/** DELETE /income/:id — delete one of the authenticated user's income entries. */
export const deleteIncome = asyncHandler(async (req: Request, res: Response) => {
  await incomeService.remove(req.user!.id, req.params.id as string);
  res.status(204).send();
});
