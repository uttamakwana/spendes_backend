import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { adminService } from './admin.service';
import type {
  ListUsersQuery,
  ListWaitlistQuery,
  TimeseriesQuery,
  UpdateUserInput,
  UpdateWaitlistInput,
} from './admin.validation';

/** GET /admin/stats — aggregate dashboard counts. */
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, req, await adminService.stats(), 'Stats retrieved successfully');
});

/** GET /admin/stats/timeseries — daily new-user & waitlist counts. */
export const getTimeseries = asyncHandler(async (req: Request, res: Response) => {
  const { days } = req.query as unknown as TimeseriesQuery;
  sendSuccess(res, req, await adminService.timeseries(days), 'Timeseries retrieved successfully');
});

/** GET /admin/users — paginated user list. */
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.listUsers(req.query as unknown as ListUsersQuery);
  sendSuccess(res, req, data, 'Users retrieved successfully');
});

/** GET /admin/users/:id — a single user. */
export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.getUser(req.params.id as string);
  sendSuccess(res, req, data, 'User retrieved successfully');
});

/** PATCH /admin/users/:id — toggle active / set roles. */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.updateUser(req.params.id as string, req.body as UpdateUserInput);
  sendSuccess(res, req, data, 'User updated successfully');
});

/** DELETE /admin/users/:id — cascade-delete the user and their data. */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.deleteUser(req.params.id as string);
  sendSuccess(res, req, result, 'User deleted successfully');
});

/** GET /admin/waitlist — paginated waitlist. */
export const listWaitlist = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.listWaitlist(req.query as unknown as ListWaitlistQuery);
  sendSuccess(res, req, data, 'Waitlist retrieved successfully');
});

/** PATCH /admin/waitlist/:id — mark invited / un-invite. */
export const updateWaitlist = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.updateWaitlist(
    req.params.id as string,
    req.body as UpdateWaitlistInput,
  );
  sendSuccess(res, req, data, 'Waitlist entry updated successfully');
});

/** DELETE /admin/waitlist/:id — remove a waitlist entry. */
export const deleteWaitlist = asyncHandler(async (req: Request, res: Response) => {
  await adminService.deleteWaitlist(req.params.id as string);
  res.status(204).send();
});
