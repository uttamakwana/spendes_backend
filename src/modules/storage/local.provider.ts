import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { config } from '../../config';
import { createLogger } from '../../logger';
import type { StorageProvider, StoredObject, UploadInput } from './storage.types';

/** Where local uploads live on disk; also served as `/uploads` by the app (see app.ts). */
export const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Development storage: writes files under `uploads/avatars/` and serves them via the
 * app's `/uploads` static route. NOT for production — most hosts give the app an
 * ephemeral disk, so files vanish on redeploy and don't scale across instances.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly logger = createLogger('LocalStorage');

  async upload(input: UploadInput): Promise<StoredObject> {
    const ext = EXTENSION[input.mimetype] ?? 'bin';
    const safeHint = input.keyHint.replace(/[^a-zA-Z0-9_-]/g, '') || 'file';
    const key = `avatars/${safeHint}-${Date.now()}.${ext}`;

    const absolute = path.join(UPLOADS_ROOT, key);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.buffer);

    // Prefer an explicitly-configured origin; otherwise use the request's origin so
    // the URL is reachable by whoever uploaded it (ngrok / LAN IP), falling back to
    // localhost only for non-request contexts (CLI/scripts).
    const base = (
      config.storage.publicBaseUrl ??
      input.baseUrl ??
      `http://localhost:${config.app.port}`
    ).replace(/\/$/, '');
    return { url: `${base}/uploads/${key}`, key };
  }

  async remove(key: string): Promise<void> {
    try {
      await rm(path.join(UPLOADS_ROOT, key), { force: true });
    } catch (error) {
      this.logger.warn(`Failed to delete local file ${key}: ${(error as Error).message}`);
    }
  }
}
