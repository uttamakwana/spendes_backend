import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { authenticate } from '../auth/auth.middleware';
import {
  createGroupExpenseSchema,
  createSettlementSchema,
  listGroupItemsQuerySchema,
  settlementIntentSchema,
} from '../splits/splits.validation';
import {
  addFriend,
  createFriendExpense,
  createFriendSettlement,
  createFriendSettlementIntent,
  getFriend,
  listFriendExpenses,
  listFriends,
} from './friends.controller';
import { addFriendSchema, friendParamsSchema } from './friends.validation';

export const friendsRouter: Router = Router();

// Every friends route requires authentication; the friendship is verified per-action.
friendsRouter.use(authenticate);

friendsRouter.post('/', validate({ body: addFriendSchema }), addFriend);
friendsRouter.get('/', listFriends);
friendsRouter.get('/:friendshipId', validate({ params: friendParamsSchema }), getFriend);

// --- Direct expenses & settlements (1-on-1) ---
friendsRouter.post(
  '/:friendshipId/expenses',
  validate({ params: friendParamsSchema, body: createGroupExpenseSchema }),
  createFriendExpense,
);
friendsRouter.get(
  '/:friendshipId/expenses',
  validate({ params: friendParamsSchema, query: listGroupItemsQuerySchema }),
  listFriendExpenses,
);
friendsRouter.post(
  '/:friendshipId/settlements',
  validate({ params: friendParamsSchema, body: createSettlementSchema }),
  createFriendSettlement,
);
friendsRouter.post(
  '/:friendshipId/settlements/intent',
  validate({ params: friendParamsSchema, body: settlementIntentSchema }),
  createFriendSettlementIntent,
);
