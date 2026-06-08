import { z } from 'zod';
import { objectId } from '../../common/utils/object-id';

/**
 * Add (or re-open) a 1-on-1 friendship: by an existing user (`userId`) or by phone
 * (`phoneNumber`, optional `dialCode` → defaults to +91). An unknown phone becomes
 * an invited placeholder that auto-links when that person registers — same as group
 * invites. `displayName` defaults to the resolved name, or the phone number.
 */
export const addFriendSchema = z
  .object({
    userId: objectId.optional(),
    dialCode: z
      .string()
      .regex(/^\+\d{1,4}$/, 'dialCode must look like +91')
      .optional(),
    phoneNumber: z
      .string()
      .regex(/^\d{10}$/, 'phoneNumber must be exactly 10 digits')
      .optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
  })
  .refine((d) => Boolean(d.userId) || Boolean(d.phoneNumber), {
    message: 'Provide either a userId or a phoneNumber to add a friend',
  });

export type AddFriendInput = z.infer<typeof addFriendSchema>;

/** Route param for the friend-scoped routes: the friendship (direct group) id. */
export const friendParamsSchema = z.object({ friendshipId: objectId });
