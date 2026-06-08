import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { authenticate } from '../auth/auth.middleware';
import {
  createExpense,
  deleteExpense,
  getExpense,
  getExpenseSummary,
  listExpenses,
  updateExpense,
} from './expenses.controller';
import {
  createExpenseSchema,
  expenseSummaryQuerySchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from './expenses.validation';

export const expensesRouter: Router = Router();

// Every expenses route requires authentication; ownership is enforced in the service.
expensesRouter.use(authenticate);

expensesRouter.post('/', validate({ body: createExpenseSchema }), createExpense);
expensesRouter.get('/', validate({ query: listExpensesQuerySchema }), listExpenses);

// `/summary` must be declared before `/:id` so "summary" is not captured as an id.
expensesRouter.get('/summary', validate({ query: expenseSummaryQuerySchema }), getExpenseSummary);

expensesRouter.get('/:id', validate({ params: idParamSchema }), getExpense);
expensesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateExpenseSchema }),
  updateExpense,
);
expensesRouter.delete('/:id', validate({ params: idParamSchema }), deleteExpense);
