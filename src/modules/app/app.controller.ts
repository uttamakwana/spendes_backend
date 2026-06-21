import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { appVersionService } from './app-version.service';
import type {
  PlatformParam,
  UpsertAppVersionInput,
  VersionCheckQuery,
} from './app-version.validation';

/** GET /app/version — public launch-time update check for the mobile app. */
export const checkVersion = asyncHandler(async (req: Request, res: Response) => {
  const { platform, version } = req.query as unknown as VersionCheckQuery;
  const result = await appVersionService.checkVersion(platform, version);
  sendSuccess(res, req, result, 'Version check completed');
});

/** GET /app/version/config — admin: list every platform's release config. */
export const listVersionConfigs = asyncHandler(async (req: Request, res: Response) => {
  const configs = await appVersionService.listConfigs();
  sendSuccess(res, req, configs, 'App version configs retrieved successfully');
});

/** PUT /app/version/:platform — admin: set a platform's release thresholds. */
export const upsertVersionConfig = asyncHandler(async (req: Request, res: Response) => {
  const { platform } = req.params as unknown as PlatformParam;
  const config = await appVersionService.upsertConfig(platform, req.body as UpsertAppVersionInput);
  sendSuccess(res, req, config, 'App version config saved successfully');
});
