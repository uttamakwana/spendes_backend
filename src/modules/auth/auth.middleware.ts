import type { NextFunction, Request, Response } from 'express';
import { config } from '../../config';
import { UnauthorizedException } from '../../common/errors/http-exception';
import { PlanType } from '../../common/enums/plan-type';
import { usersService } from '../users/users.service';
import { jwtService, type JwtPayload } from './jwt.service';

/**
 * Authentication middleware. Validates the `Authorization: Bearer <token>` access
 * token, then re-checks that the user still exists and is active (so deactivated
 * accounts lose access immediately) and attaches the principal to `req.user`.
 * Replaces NestJS's `JwtStrategy` + global `JwtAuthGuard`. Apply it per-route /
 * per-router; routes without it are public.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }

    const token = header.slice('Bearer '.length).trim();

    let payload: JwtPayload;
    try {
      payload = jwtService.verify(token, config.jwt.access.secret);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await usersService.findEntityById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is inactive or no longer exists');
    }

    req.user = {
      id: payload.sub,
      roles: payload.roles,
      plan: user.plan ?? PlanType.Free,
      phoneNumber: user.phoneNumber,
      email: user.email,
    };
    next();
  } catch (error) {
    next(error);
  }
}
