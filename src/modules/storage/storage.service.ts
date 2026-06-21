import { config, StorageProviderName } from '../../config';
import { createLogger } from '../../logger';
import { CloudinaryStorageProvider } from './cloudinary.provider';
import { LocalStorageProvider } from './local.provider';
import type { StorageProvider, StoredObject, UploadInput } from './storage.types';

/**
 * Selects the active {@link StorageProvider} from `STORAGE_PROVIDER`. Fail-fast: an
 * unknown or misconfigured provider throws at startup (mirrors the payments factory).
 */
function createStorageProvider(): StorageProvider {
  switch (config.storage.provider) {
    case StorageProviderName.Local:
      return new LocalStorageProvider();
    case StorageProviderName.Cloudinary:
      return new CloudinaryStorageProvider();
    default:
      throw new Error(`Storage provider "${config.storage.provider}" is not implemented.`);
  }
}

/**
 * Application-facing storage API. Callers (e.g. avatar upload) depend only on this
 * seam, not on local-disk vs Cloudinary specifics.
 */
export class StorageService {
  private readonly logger = createLogger('StorageService');
  private readonly provider: StorageProvider;

  constructor(provider: StorageProvider = createStorageProvider()) {
    this.provider = provider;
    this.logger.info(`Storage provider: ${this.provider.name}`);
  }

  upload(input: UploadInput): Promise<StoredObject> {
    return this.provider.upload(input);
  }

  remove(key: string): Promise<void> {
    return this.provider.remove(key);
  }
}

/** Shared singleton used across the app. */
export const storageService = new StorageService();
