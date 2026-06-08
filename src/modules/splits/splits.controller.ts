import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { splitsService } from './splits.service';
import type {
  CreateGroupExpenseInput,
  CreateSettlementInput,
  ListGroupItemsQuery,
  SettlementIntentInput,
  UpdateGroupExpenseInput,
} from './splits.validation';

/** POST /groups/:groupId/expenses — log a shared expense and its split. */
export const createGroupExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await splitsService.createExpense(
    req.user!.id,
    req.params.groupId as string,
    req.body as CreateGroupExpenseInput,
  );
  sendSuccess(res, req, expense, 'Group expense created successfully', 201);
});

/** GET /groups/:groupId/expenses — list a group's shared expenses (paginated). */
export const listGroupExpenses = asyncHandler(async (req: Request, res: Response) => {
  const page = await splitsService.listExpenses(
    req.user!.id,
    req.params.groupId as string,
    req.query as unknown as ListGroupItemsQuery,
  );
  sendSuccess(res, req, page, 'Group expenses retrieved successfully');
});

/** GET /groups/:groupId/expenses/:expenseId — fetch one shared expense. */
export const getGroupExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await splitsService.getExpense(
    req.user!.id,
    req.params.groupId as string,
    req.params.expenseId as string,
  );
  sendSuccess(res, req, expense, 'Group expense retrieved successfully');
});

/** PATCH /groups/:groupId/expenses/:expenseId — edit expense metadata (creator/admin). */
export const updateGroupExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await splitsService.updateExpense(
    req.user!.id,
    req.params.groupId as string,
    req.params.expenseId as string,
    req.body as UpdateGroupExpenseInput,
  );
  sendSuccess(res, req, expense, 'Group expense updated successfully');
});

/** DELETE /groups/:groupId/expenses/:expenseId — delete a shared expense (creator/admin). */
export const deleteGroupExpense = asyncHandler(async (req: Request, res: Response) => {
  await splitsService.deleteExpense(
    req.user!.id,
    req.params.groupId as string,
    req.params.expenseId as string,
  );
  res.status(204).send();
});

/** GET /groups/:groupId/balances — net balances + suggested "who pays whom" transfers. */
export const getGroupBalances = asyncHandler(async (req: Request, res: Response) => {
  const balances = await splitsService.getBalances(req.user!.id, req.params.groupId as string);
  sendSuccess(res, req, balances, 'Group balances retrieved successfully');
});

/** POST /groups/:groupId/settlements — record a payment between two members. */
export const createSettlement = asyncHandler(async (req: Request, res: Response) => {
  const settlement = await splitsService.createSettlement(
    req.user!.id,
    req.params.groupId as string,
    req.body as CreateSettlementInput,
  );
  sendSuccess(res, req, settlement, 'Settlement recorded successfully', 201);
});

/** GET /groups/:groupId/settlements — list recorded settlements (paginated). */
export const listSettlements = asyncHandler(async (req: Request, res: Response) => {
  const page = await splitsService.listSettlements(
    req.user!.id,
    req.params.groupId as string,
    req.query as unknown as ListGroupItemsQuery,
  );
  sendSuccess(res, req, page, 'Settlements retrieved successfully');
});

/** POST /groups/:groupId/settlements/intent — build a UPI deep link to pay a member. */
export const createSettlementIntent = asyncHandler(async (req: Request, res: Response) => {
  const intent = await splitsService.buildSettlementIntent(
    req.user!.id,
    req.params.groupId as string,
    req.body as SettlementIntentInput,
  );
  sendSuccess(res, req, intent, 'UPI payment intent created successfully');
});
