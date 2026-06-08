import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { authenticate } from '../auth/auth.middleware';
import {
  createInvestment,
  deleteInvestment,
  getInvestment,
  getInvestmentSummary,
  listInvestments,
  updateInvestment,
} from './investments.controller';
import {
  createInvestmentSchema,
  listInvestmentsQuerySchema,
  updateInvestmentSchema,
} from './investments.validation';

export const investmentsRouter: Router = Router();

// Every investments route requires authentication; ownership is enforced in the service.
investmentsRouter.use(authenticate);

investmentsRouter.post('/', validate({ body: createInvestmentSchema }), createInvestment);
investmentsRouter.get('/', validate({ query: listInvestmentsQuerySchema }), listInvestments);

// `/summary` must be declared before `/:id` so "summary" is not captured as an id.
investmentsRouter.get('/summary', getInvestmentSummary);

investmentsRouter.get('/:id', validate({ params: idParamSchema }), getInvestment);
investmentsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateInvestmentSchema }),
  updateInvestment,
);
investmentsRouter.delete('/:id', validate({ params: idParamSchema }), deleteInvestment);
