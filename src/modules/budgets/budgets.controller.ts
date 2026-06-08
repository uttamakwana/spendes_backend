import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { budgetsService } from './budgets.service';
import type { CreateBudgetInput, ListBudgetsQuery, UpdateBudgetInput } from './budgets.validation';

/** POST /budgets — create a spending limit for the authenticated user. */
export const createBudget = asyncHandler(async (req: Request, res: Response) => {
  const budget = await budgetsService.create(req.user!.id, req.body as CreateBudgetInput);
  sendSuccess(res, req, budget, 'Budget created successfully', 201);
});

/** GET /budgets — list the user's budgets with live spent/remaining for the active period. */
export const listBudgets = asyncHandler(async (req: Request, res: Response) => {
  const page = await budgetsService.findAll(req.user!.id, req.query as unknown as ListBudgetsQuery);
  sendSuccess(res, req, page, 'Budgets retrieved successfully');
});

/** GET /budgets/:id — fetch one budget with its live computed view. */
export const getBudget = asyncHandler(async (req: Request, res: Response) => {
  const budget = await budgetsService.findById(req.user!.id, req.params.id as string);
  sendSuccess(res, req, budget, 'Budget retrieved successfully');
});

/** PATCH /budgets/:id — update a budget's limit/metadata. */
export const updateBudget = asyncHandler(async (req: Request, res: Response) => {
  const budget = await budgetsService.update(
    req.user!.id,
    req.params.id as string,
    req.body as UpdateBudgetInput,
  );
  sendSuccess(res, req, budget, 'Budget updated successfully');
});

/** DELETE /budgets/:id — delete a budget. */
export const deleteBudget = asyncHandler(async (req: Request, res: Response) => {
  await budgetsService.remove(req.user!.id, req.params.id as string);
  res.status(204).send();
});
