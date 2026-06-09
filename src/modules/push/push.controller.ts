import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { pushService } from './push.service';
import type { RegisterPushTokenBody, UnregisterPushTokenBody } from './push.validation';

/** POST /push/register — store this device's Expo push token for the user. */
export const registerPushToken = asyncHandler(async (req: Request, res: Response) => {
  const { token, platform } = req.body as RegisterPushTokenBody;
  await pushService.registerToken(req.user!.id, token, platform);
  sendSuccess(res, req, { registered: true }, 'Push token registered');
});

/** POST /push/unregister — detach a token (sign-out on this device). */
export const unregisterPushToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as UnregisterPushTokenBody;
  await pushService.unregisterToken(req.user!.id, token);
  sendSuccess(res, req, { removed: true }, 'Push token removed');
});
