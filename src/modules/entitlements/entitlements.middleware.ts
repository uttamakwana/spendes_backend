import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedException } from '../../common/errors/http-exception';
import { PlanType } from '../../common/enums/plan-type';
import type { Feature } from './entitlements.config';
import { entitlementsService } from './entitlements.service';

/**
 * Gates a route behind a plan {@link Feature}. Must run after `authenticate` (so
 * `req.user` is populated). While entitlement enforcement is off — the MVP default
 * — this is a pass-through, so it is safe to attach to Pro-only routes today and
 * have it "wake up" automatically when the Pro tier ships. Mirrors `authorize`.
 *
 * @example
 * router.get('/export', authenticate, requireFeature(Feature.DataExport), exportData);
 */
export function requireFeature(feature: Feature) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedException('Authentication required');
    }
    entitlementsService.assertFeature(req.user.plan ?? PlanType.Free, feature);
    next();
  };
}
