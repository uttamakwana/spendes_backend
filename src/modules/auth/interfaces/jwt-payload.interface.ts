import { Role } from '../../../common/enums/role.enum';

/**
 * Claims embedded in both access and refresh JWTs.
 */
export interface JwtPayload {
  /** Subject — the user's id. */
  sub: string;
  email: string;
  roles: Role[];
}
