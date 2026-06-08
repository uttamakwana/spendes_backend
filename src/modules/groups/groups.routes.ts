import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { authenticate } from '../auth/auth.middleware';
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  removeGroupMember,
  updateGroup,
  updateGroupMember,
} from './groups.controller';
import {
  createGroupSchema,
  listGroupsQuerySchema,
  memberInviteSchema,
  memberParamsSchema,
  updateGroupSchema,
  updateMemberSchema,
} from './groups.validation';

export const groupsRouter: Router = Router();

// Every groups route requires authentication; membership/role is enforced in the service.
groupsRouter.use(authenticate);

groupsRouter.post('/', validate({ body: createGroupSchema }), createGroup);
groupsRouter.get('/', validate({ query: listGroupsQuerySchema }), listGroups);

groupsRouter.get('/:id', validate({ params: idParamSchema }), getGroup);
groupsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateGroupSchema }),
  updateGroup,
);
groupsRouter.delete('/:id', validate({ params: idParamSchema }), deleteGroup);

// --- Membership management ---
groupsRouter.post(
  '/:id/members',
  validate({ params: idParamSchema, body: memberInviteSchema }),
  addGroupMember,
);
groupsRouter.patch(
  '/:id/members/:memberId',
  validate({ params: memberParamsSchema, body: updateMemberSchema }),
  updateGroupMember,
);
groupsRouter.delete(
  '/:id/members/:memberId',
  validate({ params: memberParamsSchema }),
  removeGroupMember,
);
