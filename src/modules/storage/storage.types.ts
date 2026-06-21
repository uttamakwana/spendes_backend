/**
 * The storage seam. One interface, swapped by `STORAGE_PROVIDER` (local for dev,
 * Cloudinary for production) — callers depend only on this, never on a specific
 * backend. Mirrors the SmsProvider / PaymentProvider pattern.
 */
export interface UploadInput {
  /** Raw image bytes (multer memory buffer). */
  buffer: Buffer;
  /** MIME type, used to pick a file extension (already validated upstream). */
  mimetype: string;
  /** A stable id to base the object name on (e.g. the user id). */
  keyHint: string;
  /**
   * Origin (`scheme://host`) to build a local-file URL against, derived from the
   * request so it's reachable by whatever client uploaded it. Ignored by providers
   * that return their own absolute URLs (e.g. Cloudinary).
   */
  baseUrl?: string;
}

export interface StoredObject {
  /** Publicly reachable URL the client renders. */
  url: string;
  /** Provider object key / public-id — used later to delete or replace the file. */
  key: string;
}

export interface StorageProvider {
  /** Provider name, for logging/diagnostics. */
  readonly name: string;
  /** Stores the bytes and returns a public URL + a key for later deletion. */
  upload(input: UploadInput): Promise<StoredObject>;
  /** Best-effort deletion of a previously-stored object (never throws). */
  remove(key: string): Promise<void>;
}
