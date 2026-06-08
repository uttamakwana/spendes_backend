import { z } from 'zod';
import { objectId } from '../../common/utils/object-id';
import { paginationQuerySchema } from '../../common/utils/pagination';
import { GroupRole } from './groups.enums';

const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code');

/**
 * Adds one member: either an existing Spendes user (`userId`) or someone by phone
 * (`phoneNumber`, optional `dialCode` → defaults to +91). A phone that doesn't yet
 * belong to a user becomes an invited placeholder. `displayName` is optional — it
 * defaults to the resolved user's name, or the phone number for a placeholder.
 */
export const memberInviteSchema = z
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
    role: z.nativeEnum(GroupRole).optional(),
  })
  .refine((d) => Boolean(d.userId) || Boolean(d.phoneNumber), {
    message: 'Provide either a userId or a phoneNumber to add a member',
  });

export type MemberInviteInput = z.infer<typeof memberInviteSchema>;

/** Payload for `POST /groups`. `name` is required; `members` are optional initial invites. */
export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  currency: currencyCode.optional(),
  avatarUrl: z.string().url().optional(),
  members: z.array(memberInviteSchema).max(50).optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

/** Payload for `PATCH /groups/:id` (admin only). Membership is managed via the member routes. */
export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300),
    currency: currencyCode,
    avatarUrl: z.string().url(),
  })
  .partial();

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

/** Payload for `PATCH /groups/:id/members/:memberId` — promote/demote (admin only). */
export const updateMemberSchema = z.object({ role: z.nativeEnum(GroupRole) });

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/** Query for `GET /groups` — the groups the caller belongs to (paginated). */
export const listGroupsQuerySchema = paginationQuerySchema;

export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>;

/** Route params for the member sub-routes: the group id and the member's subdocument id. */
export const memberParamsSchema = z.object({ id: objectId, memberId: objectId });
