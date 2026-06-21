import { Router } from 'express';
import { Role } from '../../common/enums/role';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { authenticate } from '../auth/auth.middleware';
import { checkVersion, listVersionConfigs, upsertVersionConfig } from './app.controller';
import {
  platformParamSchema,
  upsertAppVersionSchema,
  versionCheckQuerySchema,
} from './app-version.validation';

export const appRouter: Router = Router();

// Public: the mobile app checks for updates on launch, before any login.
appRouter.get('/version', validate({ query: versionCheckQuerySchema }), checkVersion);

// Admin: maintain the per-platform release thresholds (bump when a build ships).
appRouter.get('/version/config', authenticate, authorize(Role.Admin), listVersionConfigs);
appRouter.put(
  '/version/:platform',
  authenticate,
  authorize(Role.Admin),
  validate({ params: platformParamSchema, body: upsertAppVersionSchema }),
  upsertVersionConfig,
);
