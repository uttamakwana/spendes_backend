import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import type {
  CreateGroupExpenseInput,
  CreateSettlementInput,
  ListGroupItemsQuery,
  SettlementIntentInput,
} from '../splits/splits.validation';
import { friendsService } from './friends.service';
import type { AddFriendInput } from './friends.validation';

/** POST /friends — add a friend by userId or phone (re-opens an existing friendship). */
export const addFriend = asyncHandler(async (req: Request, res: Response) => {
  const friend = await friendsService.addFriend(req.user!.id, req.body as AddFriendInput);
  sendSuccess(res, req, friend, 'Friend added successfully', 201);
});

/** GET /friends — list friends with per-friend balances and overall owed/owe totals. */
export const listFriends = asyncHandler(async (req: Request, res: Response) => {
  const friends = await friendsService.listFriends(req.user!.id);
  sendSuccess(res, req, friends, 'Friends retrieved successfully');
});

/** GET /friends/:friendshipId — a single friend with your net balance. */
export const getFriend = asyncHandler(async (req: Request, res: Response) => {
  const friend = await friendsService.getFriend(req.user!.id, req.params.friendshipId as string);
  sendSuccess(res, req, friend, 'Friend retrieved successfully');
});

/** POST /friends/:friendshipId/expenses — log a direct (1-on-1) split expense. */
export const createFriendExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await friendsService.createExpense(
    req.user!.id,
    req.params.friendshipId as string,
    req.body as CreateGroupExpenseInput,
  );
  sendSuccess(res, req, expense, 'Friend expense created successfully', 201);
});

/** GET /friends/:friendshipId/expenses — list the direct expenses with a friend. */
export const listFriendExpenses = asyncHandler(async (req: Request, res: Response) => {
  const page = await friendsService.listExpenses(
    req.user!.id,
    req.params.friendshipId as string,
    req.query as unknown as ListGroupItemsQuery,
  );
  sendSuccess(res, req, page, 'Friend expenses retrieved successfully');
});

/** POST /friends/:friendshipId/settlements — record a payment with a friend. */
export const createFriendSettlement = asyncHandler(async (req: Request, res: Response) => {
  const settlement = await friendsService.createSettlement(
    req.user!.id,
    req.params.friendshipId as string,
    req.body as CreateSettlementInput,
  );
  sendSuccess(res, req, settlement, 'Settlement recorded successfully', 201);
});

/** POST /friends/:friendshipId/settlements/intent — build a UPI deep link to pay a friend. */
export const createFriendSettlementIntent = asyncHandler(async (req: Request, res: Response) => {
  const intent = await friendsService.buildSettlementIntent(
    req.user!.id,
    req.params.friendshipId as string,
    req.body as SettlementIntentInput,
  );
  sendSuccess(res, req, intent, 'UPI payment intent created successfully');
});
