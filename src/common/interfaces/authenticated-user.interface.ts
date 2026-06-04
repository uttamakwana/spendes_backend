import type { Request } from 'express';
import { Role } from '../enums/role.enum';

/**
 * The shape of the user object attached to the request by the JWT strategy
 * after a token has been validated. This is the trusted, authenticated principal.
 */
export interface AuthenticatedUser {
  id: string;
  roles: Role[];
  /** National number without dial code; present once loaded by the JWT strategy. */
  phoneNumber?: string;
  email?: string;
}

/**
 * An Express request that has passed authentication and therefore carries a user.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
