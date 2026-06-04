import { Role } from '../../../common/enums/role.enum';

/**
 * Claims embedded in both access and refresh JWTs. Kept minimal — the user's
 * current details are re-loaded from the database on each request by the strategy.
 */
export interface JwtPayload {
  /** Subject — the user's id. */
  sub: string;
  roles: Role[];
}
