import { Router } from 'express';
import { Role } from '../../common/enums/role';
import { authorize } from '../../common/middleware/authorize';
import { createRateLimiter } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { paginationQuerySchema } from '../../common/utils/pagination';
import { uploadSingleImage } from '../../common/middleware/upload';
import { authenticate } from '../auth/auth.middleware';
import {
  deleteMe,
  deleteMyAvatar,
  deleteUser,
  getMe,
  getUser,
  listUsers,
  updateMe,
  updateMyNotificationPreferences,
  uploadMyAvatar,
} from './users.controller';
import { updateNotificationPreferencesSchema, updateUserSchema } from './users.validation';

export const usersRouter: Router = Router();

// Every users route requires authentication.
usersRouter.use(authenticate);

// Per-user cap on avatar uploads — at most 10 per hour, keyed on the user id (not IP),
// so one account can't spam the storage backend. Runs before multer parses the file.
const avatarUploadLimiter = createRateLimiter(10, 60 * 60, {
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  message: 'You’re changing your profile photo too often. Please try again in a little while.',
});

// `/me` routes must be declared before `/:id` so "me" is not captured as an id.
usersRouter.get('/me', getMe);
usersRouter.patch('/me', validate({ body: updateUserSchema }), updateMe);
usersRouter.patch(
  '/me/notification-preferences',
  validate({ body: updateNotificationPreferencesSchema }),
  updateMyNotificationPreferences,
);
usersRouter.post('/me/avatar', avatarUploadLimiter, uploadSingleImage('image'), uploadMyAvatar);
usersRouter.delete('/me/avatar', deleteMyAvatar);
usersRouter.delete('/me', deleteMe);

// Admin-only management routes.
usersRouter.get('/', authorize(Role.Admin), validate({ query: paginationQuerySchema }), listUsers);
usersRouter.get('/:id', authorize(Role.Admin), validate({ params: idParamSchema }), getUser);
usersRouter.delete('/:id', authorize(Role.Admin), validate({ params: idParamSchema }), deleteUser);
