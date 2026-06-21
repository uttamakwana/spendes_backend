import { z } from 'zod';
import { isValidVersion } from '../../common/utils/semver';
import { MobilePlatform } from './app.enums';

const versionString = z.string().trim().refine(isValidVersion, 'must be a version like 1.2.3');

/** Query for `GET /app/version` — the app reports its platform + installed version. */
export const versionCheckQuerySchema = z.object({
  platform: z.nativeEnum(MobilePlatform),
  version: versionString,
});

export type VersionCheckQuery = z.infer<typeof versionCheckQuerySchema>;

/** Path param selecting which platform's config to read/edit. */
export const platformParamSchema = z.object({
  platform: z.nativeEnum(MobilePlatform),
});

export type PlatformParam = z.infer<typeof platformParamSchema>;

/** Admin body for `PUT /app/version/:platform` — set the release thresholds. */
export const upsertAppVersionSchema = z.object({
  latestVersion: versionString,
  minSupportedVersion: versionString,
  storeUrl: z.string().trim().url(),
  releaseNotes: z.string().trim().max(2000).optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().trim().max(500).optional(),
});

export type UpsertAppVersionInput = z.infer<typeof upsertAppVersionSchema>;
