import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';
import { MobilePlatform } from './app.enums';

/**
 * Per-platform release configuration that drives the mobile app-update prompt. One
 * row per platform (ios/android), edited by an admin when a new build ships to the
 * store — no backend redeploy needed. The app reads it (publicly) on launch:
 * `latestVersion` powers the soft "update available" nudge; an install older than
 * `minSupportedVersion` is force-gated; `maintenanceMode` blocks the app entirely.
 */
export interface AppVersionDocument extends BaseDocument {
  _id: Types.ObjectId;
  platform: MobilePlatform;
  /** The newest version published to the store. */
  latestVersion: string;
  /** Installs older than this are forced to update before they can continue. */
  minSupportedVersion: string;
  /** Deep link to the store listing (App Store / Play Store). */
  storeUrl: string;
  /** Optional "what's new" copy shown in the update prompt. */
  releaseNotes?: string;
  /** When true, the app should show a maintenance screen and block usage. */
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const appVersionSchema = new Schema<AppVersionDocument>(
  {
    platform: {
      type: String,
      enum: Object.values(MobilePlatform),
      required: true,
      unique: true,
    },
    latestVersion: { type: String, required: true, trim: true },
    minSupportedVersion: { type: String, required: true, trim: true },
    storeUrl: { type: String, required: true, trim: true },
    releaseNotes: { type: String, trim: true },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, trim: true },
  },
  { timestamps: true, collection: 'app_versions' },
);

export const AppVersionModel = model<AppVersionDocument>('AppVersion', appVersionSchema);
