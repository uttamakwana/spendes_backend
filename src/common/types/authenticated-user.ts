import type { Role } from '../enums/role';

/**
 * The trusted, authenticated principal attached to the request by the
 * `authenticate` middleware after a valid access token has been verified.
 */
export interface AuthenticatedUser {
  id: string;
  roles: Role[];
  /** National number without dial code. */
  phoneNumber?: string;
  email?: string;
}
