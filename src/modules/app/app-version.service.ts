import { isOlderThan } from '../../common/utils/semver';
import { createLogger } from '../../logger';
import type { MobilePlatform } from './app.enums';
import {
  toConfigResponse,
  type AppVersionConfigResponse,
  type VersionCheckResponse,
} from './app-version-response';
import { appVersionRepository, AppVersionRepository } from './app-version.repository';
import type { UpsertAppVersionInput } from './app-version.validation';

/**
 * Drives the mobile app-update prompt. The app calls {@link checkVersion} on launch;
 * an admin maintains the per-platform thresholds via {@link upsertConfig}. When a
 * platform has no config yet, the check fails open (no update, no force-gate) so a
 * misconfiguration can never brick the app.
 */
export class AppVersionService {
  private readonly logger = createLogger('AppVersionService');

  constructor(private readonly repository: AppVersionRepository) {}

  /** Compares an installed build against the platform's published thresholds. */
  async checkVersion(
    platform: MobilePlatform,
    currentVersion: string,
  ): Promise<VersionCheckResponse> {
    const config = await this.repository.findByPlatform(platform);

    // Fail open: with nothing configured, never prompt or block.
    if (!config) {
      return {
        platform,
        currentVersion,
        latestVersion: currentVersion,
        minSupportedVersion: currentVersion,
        updateAvailable: false,
        forceUpdate: false,
        storeUrl: '',
        maintenanceMode: false,
      };
    }

    return {
      platform,
      currentVersion,
      latestVersion: config.latestVersion,
      minSupportedVersion: config.minSupportedVersion,
      updateAvailable: isOlderThan(currentVersion, config.latestVersion),
      forceUpdate: isOlderThan(currentVersion, config.minSupportedVersion),
      storeUrl: config.storeUrl,
      releaseNotes: config.releaseNotes,
      maintenanceMode: config.maintenanceMode,
      maintenanceMessage: config.maintenanceMessage,
    };
  }

  /** All configured platforms (admin). */
  async listConfigs(): Promise<AppVersionConfigResponse[]> {
    const docs = await this.repository.findAllPlatforms();
    return docs.map(toConfigResponse);
  }

  /** Creates or updates a platform's release config (admin). */
  async upsertConfig(
    platform: MobilePlatform,
    dto: UpsertAppVersionInput,
  ): Promise<AppVersionConfigResponse> {
    const config = await this.repository.upsertByPlatform(platform, {
      latestVersion: dto.latestVersion,
      minSupportedVersion: dto.minSupportedVersion,
      storeUrl: dto.storeUrl,
      releaseNotes: dto.releaseNotes,
      maintenanceMode: dto.maintenanceMode ?? false,
      maintenanceMessage: dto.maintenanceMessage,
    });
    this.logger.info(`App version config updated for ${platform}: latest=${dto.latestVersion}`);
    return toConfigResponse(config);
  }
}

/** Shared singleton instance used across the app. */
export const appVersionService = new AppVersionService(appVersionRepository);
