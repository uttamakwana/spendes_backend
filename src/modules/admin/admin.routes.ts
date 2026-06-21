import { Router } from 'express';
import { Role } from '../../common/enums/role';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { authenticate } from '../auth/auth.middleware';
import {
  deleteUser,
  deleteWaitlist,
  getStats,
  getTimeseries,
  getUser,
  listUsers,
  listWaitlist,
  updateUser,
  updateWaitlist,
} from './admin.controller';
import {
  listUsersQuerySchema,
  listWaitlistQuerySchema,
  timeseriesQuerySchema,
  updateUserSchema,
  updateWaitlistSchema,
} from './admin.validation';

export const adminRouter: Router = Router();

// Every admin route requires an authenticated user holding the `admin` role.
adminRouter.use(authenticate, authorize(Role.Admin));

adminRouter.get('/stats', getStats);
adminRouter.get('/stats/timeseries', validate({ query: timeseriesQuerySchema }), getTimeseries);

adminRouter.get('/users', validate({ query: listUsersQuerySchema }), listUsers);
adminRouter.get('/users/:id', validate({ params: idParamSchema }), getUser);
adminRouter.patch(
  '/users/:id',
  validate({ params: idParamSchema, body: updateUserSchema }),
  updateUser,
);
adminRouter.delete('/users/:id', validate({ params: idParamSchema }), deleteUser);

adminRouter.get('/waitlist', validate({ query: listWaitlistQuerySchema }), listWaitlist);
adminRouter.patch(
  '/waitlist/:id',
  validate({ params: idParamSchema, body: updateWaitlistSchema }),
  updateWaitlist,
);
adminRouter.delete('/waitlist/:id', validate({ params: idParamSchema }), deleteWaitlist);
