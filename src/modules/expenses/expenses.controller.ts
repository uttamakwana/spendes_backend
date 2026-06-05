import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { expensesService } from './expenses.service';
import type {
  CreateExpenseInput,
  ExpenseSummaryQuery,
  ListExpensesQuery,
  UpdateExpenseInput,
} from './expenses.validation';

/** POST /expenses — record a new expense for the authenticated user. */
export const createExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await expensesService.create(req.user!.id, req.body as CreateExpenseInput);
  sendSuccess(res, req, expense, 'Expense created successfully', 201);
});

/** GET /expenses — list the authenticated user's expenses (paginated + filtered). */
export const listExpenses = asyncHandler(async (req: Request, res: Response) => {
  const page = await expensesService.findAll(
    req.user!.id,
    req.query as unknown as ListExpensesQuery,
  );
  sendSuccess(res, req, page, 'Expenses retrieved successfully');
});

/** GET /expenses/summary — spend totals and breakdowns over an optional date window. */
export const getExpenseSummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await expensesService.summary(
    req.user!.id,
    req.query as unknown as ExpenseSummaryQuery,
  );
  sendSuccess(res, req, summary, 'Expense summary retrieved successfully');
});

/** GET /expenses/:id — fetch one of the authenticated user's expenses. */
export const getExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await expensesService.findById(req.user!.id, req.params.id as string);
  sendSuccess(res, req, expense, 'Expense retrieved successfully');
});

/** PATCH /expenses/:id — update one of the authenticated user's expenses. */
export const updateExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await expensesService.update(
    req.user!.id,
    req.params.id as string,
    req.body as UpdateExpenseInput,
  );
  sendSuccess(res, req, expense, 'Expense updated successfully');
});

/** DELETE /expenses/:id — delete one of the authenticated user's expenses. */
export const deleteExpense = asyncHandler(async (req: Request, res: Response) => {
  await expensesService.remove(req.user!.id, req.params.id as string);
  res.status(204).send();
});
