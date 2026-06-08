import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { authenticate } from '../auth/auth.middleware';
import {
  createBudget,
  deleteBudget,
  getBudget,
  listBudgets,
  updateBudget,
} from './budgets.controller';
import {
  createBudgetSchema,
  listBudgetsQuerySchema,
  updateBudgetSchema,
} from './budgets.validation';

export const budgetsRouter: Router = Router();

// Every budgets route requires authentication; ownership is enforced in the service.
budgetsRouter.use(authenticate);

budgetsRouter.post('/', validate({ body: createBudgetSchema }), createBudget);
budgetsRouter.get('/', validate({ query: listBudgetsQuerySchema }), listBudgets);
budgetsRouter.get('/:id', validate({ params: idParamSchema }), getBudget);
budgetsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateBudgetSchema }),
  updateBudget,
);
budgetsRouter.delete('/:id', validate({ params: idParamSchema }), deleteBudget);
