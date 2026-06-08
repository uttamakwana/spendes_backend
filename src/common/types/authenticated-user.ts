import type { Role } from '../enums/role';
import type { PlanType } from '../enums/plan-type';

/**
 * The trusted, authenticated principal attached to the request by the
 * `authenticate` middleware after a valid access token has been verified.
 */
export interface AuthenticatedUser {
  id: string;
  roles: Role[];
  /** Subscription tier, read fresh from the user doc each request (never from the token). */
  plan: PlanType;
  /** National number without dial code. */
  phoneNumber?: string;
  email?: string;
}
