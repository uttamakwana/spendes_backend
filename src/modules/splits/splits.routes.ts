import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { authenticate } from '../auth/auth.middleware';
import {
  createGroupExpense,
  createSettlement,
  createSettlementIntent,
  deleteGroupExpense,
  getGroupBalances,
  getGroupExpense,
  listGroupExpenses,
  listSettlements,
  updateGroupExpense,
} from './splits.controller';
import {
  createGroupExpenseSchema,
  createSettlementSchema,
  expenseParamsSchema,
  groupScopeParamsSchema,
  listGroupItemsQuerySchema,
  settlementIntentSchema,
  updateGroupExpenseSchema,
} from './splits.validation';

/**
 * Group-scoped splits routes. Mounted at `/groups/:groupId` (so `mergeParams` is
 * required to see `groupId`); membership and per-action permissions are enforced in
 * the service. Mounted *after* the groups router, which handles the bare
 * `/groups/:id` routes, so these deeper paths fall through to here.
 */
export const splitsRouter: Router = Router({ mergeParams: true });

splitsRouter.use(authenticate);

// --- Shared expenses ---
splitsRouter.post(
  '/expenses',
  validate({ params: groupScopeParamsSchema, body: createGroupExpenseSchema }),
  createGroupExpense,
);
splitsRouter.get(
  '/expenses',
  validate({ params: groupScopeParamsSchema, query: listGroupItemsQuerySchema }),
  listGroupExpenses,
);
splitsRouter.get(
  '/expenses/:expenseId',
  validate({ params: expenseParamsSchema }),
  getGroupExpense,
);
splitsRouter.patch(
  '/expenses/:expenseId',
  validate({ params: expenseParamsSchema, body: updateGroupExpenseSchema }),
  updateGroupExpense,
);
splitsRouter.delete(
  '/expenses/:expenseId',
  validate({ params: expenseParamsSchema }),
  deleteGroupExpense,
);

// --- Balances ---
splitsRouter.get('/balances', validate({ params: groupScopeParamsSchema }), getGroupBalances);

// --- Settlements ---
splitsRouter.post(
  '/settlements',
  validate({ params: groupScopeParamsSchema, body: createSettlementSchema }),
  createSettlement,
);
splitsRouter.get(
  '/settlements',
  validate({ params: groupScopeParamsSchema, query: listGroupItemsQuerySchema }),
  listSettlements,
);
splitsRouter.post(
  '/settlements/intent',
  validate({ params: groupScopeParamsSchema, body: settlementIntentSchema }),
  createSettlementIntent,
);
