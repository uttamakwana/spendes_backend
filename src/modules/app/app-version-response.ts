import type { MobilePlatform } from './app.enums';
import type { AppVersionDocument } from './app-version.model';

/**
 * What the mobile app receives from `GET /app/version`. `updateAvailable` drives a
 * soft, dismissible nudge; `forceUpdate` is a hard gate — the app should block until
 * the user updates. `maintenanceMode` overrides everything (show a maintenance screen).
 */
export interface VersionCheckResponse {
  platform: MobilePlatform;
  currentVersion: string;
  latestVersion: string;
  minSupportedVersion: string;
  /** `currentVersion < latestVersion` — a newer build exists. */
  updateAvailable: boolean;
  /** `currentVersion < minSupportedVersion` — the install is too old to keep using. */
  forceUpdate: boolean;
  storeUrl: string;
  releaseNotes?: string;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
}

/** Full per-platform config (admin view). */
export interface AppVersionConfigResponse {
  platform: MobilePlatform;
  latestVersion: string;
  minSupportedVersion: string;
  storeUrl: string;
  releaseNotes?: string;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a config document to its admin response shape. */
export function toConfigResponse(doc: AppVersionDocument): AppVersionConfigResponse {
  return {
    platform: doc.platform,
    latestVersion: doc.latestVersion,
    minSupportedVersion: doc.minSupportedVersion,
    storeUrl: doc.storeUrl,
    releaseNotes: doc.releaseNotes,
    maintenanceMode: doc.maintenanceMode,
    maintenanceMessage: doc.maintenanceMessage,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
