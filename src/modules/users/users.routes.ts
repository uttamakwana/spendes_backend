import { Router } from 'express';
import { Role } from '../../common/enums/role';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { paginationQuerySchema } from '../../common/utils/pagination';
import { authenticate } from '../auth/auth.middleware';
import { deleteUser, getMe, getUser, listUsers, updateMe } from './users.controller';
import { updateUserSchema } from './users.validation';

export const usersRouter: Router = Router();

// Every users route requires authentication.
usersRouter.use(authenticate);

// `/me` routes must be declared before `/:id` so "me" is not captured as an id.
usersRouter.get('/me', getMe);
usersRouter.patch('/me', validate({ body: updateUserSchema }), updateMe);

// Admin-only management routes.
usersRouter.get('/', authorize(Role.Admin), validate({ query: paginationQuerySchema }), listUsers);
usersRouter.get('/:id', authorize(Role.Admin), validate({ params: idParamSchema }), getUser);
usersRouter.delete('/:id', authorize(Role.Admin), validate({ params: idParamSchema }), deleteUser);
