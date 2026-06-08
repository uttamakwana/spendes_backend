import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { goalsService } from './goals.service';
import type {
  ContributeGoalInput,
  CreateGoalInput,
  ListGoalsQuery,
  UpdateGoalInput,
} from './goals.validation';

/** POST /goals — create a savings goal. */
export const createGoal = asyncHandler(async (req: Request, res: Response) => {
  const goal = await goalsService.create(req.user!.id, req.body as CreateGoalInput);
  sendSuccess(res, req, goal, 'Goal created successfully', 201);
});

/** GET /goals — list the user's goals with live progress (paginated). */
export const listGoals = asyncHandler(async (req: Request, res: Response) => {
  const page = await goalsService.findAll(req.user!.id, req.query as unknown as ListGoalsQuery);
  sendSuccess(res, req, page, 'Goals retrieved successfully');
});

/** GET /goals/:id — fetch one goal with its progress. */
export const getGoal = asyncHandler(async (req: Request, res: Response) => {
  const goal = await goalsService.findById(req.user!.id, req.params.id as string);
  sendSuccess(res, req, goal, 'Goal retrieved successfully');
});

/** PATCH /goals/:id — update a goal's target/metadata. */
export const updateGoal = asyncHandler(async (req: Request, res: Response) => {
  const goal = await goalsService.update(
    req.user!.id,
    req.params.id as string,
    req.body as UpdateGoalInput,
  );
  sendSuccess(res, req, goal, 'Goal updated successfully');
});

/** DELETE /goals/:id — delete a goal. */
export const deleteGoal = asyncHandler(async (req: Request, res: Response) => {
  await goalsService.remove(req.user!.id, req.params.id as string);
  res.status(204).send();
});

/** POST /goals/:id/contribute — add a deposit toward a goal. */
export const contributeToGoal = asyncHandler(async (req: Request, res: Response) => {
  const goal = await goalsService.contribute(
    req.user!.id,
    req.params.id as string,
    req.body as ContributeGoalInput,
  );
  sendSuccess(res, req, goal, 'Contribution added successfully', 201);
});
