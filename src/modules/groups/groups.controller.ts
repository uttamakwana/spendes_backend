import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { groupsService } from './groups.service';
import type {
  CreateGroupInput,
  ListGroupsQuery,
  MemberInviteInput,
  UpdateGroupInput,
  UpdateMemberInput,
} from './groups.validation';

/** POST /groups — create a group; the caller becomes its first admin member. */
export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const group = await groupsService.create(req.user!.id, req.body as CreateGroupInput);
  sendSuccess(res, req, group, 'Group created successfully', 201);
});

/** GET /groups — list the groups the caller is a member of (paginated). */
export const listGroups = asyncHandler(async (req: Request, res: Response) => {
  const page = await groupsService.findAll(req.user!.id, req.query as unknown as ListGroupsQuery);
  sendSuccess(res, req, page, 'Groups retrieved successfully');
});

/** GET /groups/:id — fetch a group the caller belongs to. */
export const getGroup = asyncHandler(async (req: Request, res: Response) => {
  const group = await groupsService.findById(req.user!.id, req.params.id as string);
  sendSuccess(res, req, group, 'Group retrieved successfully');
});

/** PATCH /groups/:id — update group details (admin only). */
export const updateGroup = asyncHandler(async (req: Request, res: Response) => {
  const group = await groupsService.update(
    req.user!.id,
    req.params.id as string,
    req.body as UpdateGroupInput,
  );
  sendSuccess(res, req, group, 'Group updated successfully');
});

/** DELETE /groups/:id — archive a group (admin only). */
export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
  await groupsService.remove(req.user!.id, req.params.id as string);
  res.status(204).send();
});

/** POST /groups/:id/members — add a member by userId or by phone (admin only). */
export const addGroupMember = asyncHandler(async (req: Request, res: Response) => {
  const group = await groupsService.addMember(
    req.user!.id,
    req.params.id as string,
    req.body as MemberInviteInput,
  );
  sendSuccess(res, req, group, 'Member added successfully', 201);
});

/** PATCH /groups/:id/members/:memberId — change a member's role (admin only). */
export const updateGroupMember = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body as UpdateMemberInput;
  const group = await groupsService.updateMemberRole(
    req.user!.id,
    req.params.id as string,
    req.params.memberId as string,
    role,
  );
  sendSuccess(res, req, group, 'Member updated successfully');
});

/** DELETE /groups/:id/members/:memberId — remove a member, or leave the group yourself. */
export const removeGroupMember = asyncHandler(async (req: Request, res: Response) => {
  const group = await groupsService.removeMember(
    req.user!.id,
    req.params.id as string,
    req.params.memberId as string,
  );
  sendSuccess(res, req, group, 'Member removed successfully');
});
