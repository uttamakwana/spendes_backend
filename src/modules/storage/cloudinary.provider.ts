import { v2 as cloudinary } from 'cloudinary';
import { config } from '../../config';
import { createLogger } from '../../logger';
import type { StorageProvider, StoredObject, UploadInput } from './storage.types';

/**
 * Production storage: Cloudinary. Durable, CDN-backed, and resizes/normalizes the
 * image on upload (square 512px webp, smart crop) so we store one tidy avatar and
 * `secure_url` is the transformed asset the client renders directly.
 */
export class CloudinaryStorageProvider implements StorageProvider {
  readonly name = 'cloudinary';
  private readonly logger = createLogger('CloudinaryStorage');

  constructor() {
    const { cloudName, apiKey, apiSecret } = config.storage.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        'STORAGE_PROVIDER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      );
    }
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  upload(input: UploadInput): Promise<StoredObject> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: config.storage.cloudinary.folder,
          public_id: `${input.keyHint}-${Date.now()}`,
          resource_type: 'image',
          overwrite: true,
          // Normalize to a square avatar with a smart crop, delivered as webp.
          transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'auto' }],
          format: 'webp',
        },
        (error, result) => {
          if (error || !result) {
            return reject(error ?? new Error('Cloudinary upload failed'));
          }
          resolve({ url: result.secure_url, key: result.public_id });
        },
      );
      stream.end(input.buffer);
    });
  }

  async remove(key: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(key, { resource_type: 'image' });
    } catch (error) {
      this.logger.warn(`Failed to delete Cloudinary asset ${key}: ${(error as Error).message}`);
    }
  }
}
