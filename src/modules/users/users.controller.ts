import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { BadRequestException } from '../../common/errors/http-exception';
import { sendSuccess } from '../../common/utils/response';
import type { PaginationQuery } from '../../common/utils/pagination';
import type { UpdateNotificationPreferencesInput, UpdateUserInput } from './users.validation';
import { usersService } from './users.service';

/** GET /users/me — the authenticated user's own profile. */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.findById(req.user!.id);
  sendSuccess(res, req, user, 'Profile retrieved successfully');
});

/** PATCH /users/me — update the authenticated user's profile. */
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.update(req.user!.id, req.body as UpdateUserInput);
  sendSuccess(res, req, user, 'Profile updated successfully');
});

/** PATCH /users/me/notification-preferences — update the authenticated user's push opt-outs. */
export const updateMyNotificationPreferences = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.updateNotificationPreferences(
    req.user!.id,
    req.body as UpdateNotificationPreferencesInput,
  );
  sendSuccess(res, req, user, 'Notification preferences updated');
});

/** POST /users/me/avatar — upload/replace the authenticated user's profile photo (multipart, field `image`). */
export const uploadMyAvatar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new BadRequestException('No image provided. Send a multipart form field named "image".');
  }
  // Build local-file URLs against the same origin the client used to reach us
  // (honours the proxy via `trust proxy`, so ngrok https is reflected correctly).
  const host = req.get('host');
  const baseUrl = host ? `${req.protocol}://${host}` : undefined;
  const user = await usersService.setAvatar(
    req.user!.id,
    { buffer: req.file.buffer, mimetype: req.file.mimetype },
    baseUrl,
  );
  sendSuccess(res, req, user, 'Profile photo updated');
});

/** DELETE /users/me/avatar — remove the authenticated user's profile photo. */
export const deleteMyAvatar = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.removeAvatar(req.user!.id);
  sendSuccess(res, req, user, 'Profile photo removed');
});

/** DELETE /users/me — permanently delete the authenticated user's own account and all their data. */
export const deleteMe = asyncHandler(async (req: Request, res: Response) => {
  await usersService.deleteAccount(req.user!.id);
  sendSuccess(res, req, { deleted: true }, 'Your account has been permanently deleted');
});

/** GET /users — list users (admin only). */
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = await usersService.findAll(req.query as unknown as PaginationQuery);
  sendSuccess(res, req, page, 'Users retrieved successfully');
});

/** GET /users/:id — fetch a user by id (admin only). */
export const getUser = asyncHandler(async (req: Request, res: Response) => {
  // `id` is validated to a single ObjectId string by `validate({ params: idParamSchema })`.
  const user = await usersService.findById(req.params.id as string);
  sendSuccess(res, req, user, 'User retrieved successfully');
});

/** DELETE /users/:id — delete a user by id (admin only). */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  await usersService.remove(req.params.id as string);
  res.status(204).send();
});
