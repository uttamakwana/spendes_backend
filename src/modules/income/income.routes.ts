import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { authenticate } from '../auth/auth.middleware';
import {
  createIncome,
  deleteIncome,
  getIncome,
  getIncomeSummary,
  listIncome,
  updateIncome,
} from './income.controller';
import {
  createIncomeSchema,
  incomeSummaryQuerySchema,
  listIncomeQuerySchema,
  updateIncomeSchema,
} from './income.validation';

export const incomeRouter: Router = Router();

// Every income route requires authentication; ownership is enforced in the service.
incomeRouter.use(authenticate);

incomeRouter.post('/', validate({ body: createIncomeSchema }), createIncome);
incomeRouter.get('/', validate({ query: listIncomeQuerySchema }), listIncome);

// `/summary` must be declared before `/:id` so "summary" is not captured as an id.
incomeRouter.get('/summary', validate({ query: incomeSummaryQuerySchema }), getIncomeSummary);

incomeRouter.get('/:id', validate({ params: idParamSchema }), getIncome);
incomeRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateIncomeSchema }),
  updateIncome,
);
incomeRouter.delete('/:id', validate({ params: idParamSchema }), deleteIncome);
