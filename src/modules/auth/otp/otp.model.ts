import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../../database/base.repository';

/**
 * A short-lived, one-time verification code tied to a phone identity. The code
 * itself is never stored — only a bcrypt hash — and the document auto-expires via
 * a TTL index so stale codes clean themselves up. At most one active code exists
 * per phone (the request flow clears prior ones).
 */
export interface OtpCodeDocument extends BaseDocument {
  _id: Types.ObjectId;
  dialCode: string;
  phoneNumber: string;
  /** Bcrypt hash of the issued code. */
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const otpCodeSchema = new Schema<OtpCodeDocument>(
  {
    dialCode: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'otp_codes' },
);

// TTL: Mongo removes the document once `expiresAt` passes (sweep runs ~every 60s).
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Fast lookup of the latest code for a phone.
otpCodeSchema.index({ dialCode: 1, phoneNumber: 1, createdAt: -1 });

export const OtpCodeModel = model<OtpCodeDocument>('OtpCode', otpCodeSchema);
