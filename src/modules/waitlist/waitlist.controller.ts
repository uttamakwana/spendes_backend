import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { waitlistService } from './waitlist.service';
import type { JoinWaitlistInput } from './waitlist.validation';

/** POST /waitlist — join the early-access waitlist (public, idempotent). */
export const joinWaitlist = asyncHandler(async (req: Request, res: Response) => {
  const result = await waitlistService.join(req.body as JoinWaitlistInput);
  sendSuccess(
    res,
    req,
    result,
    result.alreadyJoined ? "You're already on the list" : "You're on the list",
    result.alreadyJoined ? 200 : 201,
  );
});
