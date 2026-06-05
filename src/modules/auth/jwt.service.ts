import jwt from 'jsonwebtoken';
import type { Role } from '../../common/enums/role';

/**
 * Claims embedded in both access and refresh JWTs. Kept minimal — the user's
 * current details are re-loaded from the database on each request by the
 * `authenticate` middleware.
 */
export interface JwtPayload {
  /** Subject — the user's id. */
  sub: string;
  roles: Role[];
}

/**
 * Thin wrapper around `jsonwebtoken`. Access and refresh tokens use different
 * secrets, supplied per call by {@link AuthService}. Replaces NestJS's `JwtModule`.
 */
export class JwtService {
  sign(payload: JwtPayload, secret: string, expiresIn: string): string {
    return jwt.sign(payload, secret, {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    });
  }

  /** Verifies signature + expiry and returns the decoded payload. Throws on failure. */
  verify(token: string, secret: string): JwtPayload {
    return jwt.verify(token, secret) as JwtPayload;
  }
}

export const jwtService = new JwtService();
