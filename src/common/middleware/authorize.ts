import type { NextFunction, Request, Response } from 'express';
import { ForbiddenException, UnauthorizedException } from '../errors/http-exception';
import type { Role } from '../enums/role';

/**
 * Restricts a route to users holding at least one of the given roles. Must run
 * after `authenticate` (so `req.user` is populated). Passing no roles allows any
 * authenticated user. Replaces NestJS's `@Roles()` + `RolesGuard`.
 *
 * @example
 * router.get('/', authenticate, authorize(Role.Admin), listUsers);
 */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (roles.length === 0) {
      next();
      return;
    }
    const hasRole = req.user.roles?.some((role) => roles.includes(role)) ?? false;
    if (!hasRole) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }
    next();
  };
}
