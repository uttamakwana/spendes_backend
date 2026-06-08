import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { authenticate } from '../auth/auth.middleware';
import {
  createEmi,
  deleteEmi,
  getEmi,
  getEmiSummary,
  listEmis,
  updateEmi,
} from './emis.controller';
import { createEmiSchema, listEmisQuerySchema, updateEmiSchema } from './emis.validation';

export const emisRouter: Router = Router();

// Every EMIs route requires authentication; ownership is enforced in the service.
emisRouter.use(authenticate);

emisRouter.post('/', validate({ body: createEmiSchema }), createEmi);
emisRouter.get('/', validate({ query: listEmisQuerySchema }), listEmis);

// `/summary` must be declared before `/:id` so "summary" is not captured as an id.
emisRouter.get('/summary', getEmiSummary);

emisRouter.get('/:id', validate({ params: idParamSchema }), getEmi);
emisRouter.patch('/:id', validate({ params: idParamSchema, body: updateEmiSchema }), updateEmi);
emisRouter.delete('/:id', validate({ params: idParamSchema }), deleteEmi);
