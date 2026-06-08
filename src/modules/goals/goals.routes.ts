import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { authenticate } from '../auth/auth.middleware';
import {
  contributeToGoal,
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  updateGoal,
} from './goals.controller';
import {
  contributeGoalSchema,
  createGoalSchema,
  listGoalsQuerySchema,
  updateGoalSchema,
} from './goals.validation';

export const goalsRouter: Router = Router();

// Every goals route requires authentication; ownership is enforced in the service.
goalsRouter.use(authenticate);

goalsRouter.post('/', validate({ body: createGoalSchema }), createGoal);
goalsRouter.get('/', validate({ query: listGoalsQuerySchema }), listGoals);
goalsRouter.get('/:id', validate({ params: idParamSchema }), getGoal);
goalsRouter.patch('/:id', validate({ params: idParamSchema, body: updateGoalSchema }), updateGoal);
goalsRouter.delete('/:id', validate({ params: idParamSchema }), deleteGoal);
goalsRouter.post(
  '/:id/contribute',
  validate({ params: idParamSchema, body: contributeGoalSchema }),
  contributeToGoal,
);
