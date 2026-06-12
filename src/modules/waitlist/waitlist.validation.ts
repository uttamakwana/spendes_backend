import { z } from 'zod';

/**
 * Payload for `POST /waitlist`. Email is normalized (trim + lowercase) here so
 * the unique index and "already joined" check always compare the same shape.
 */
export const joinWaitlistSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  source: z.string().trim().min(1).max(50).optional(),
});

export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;
