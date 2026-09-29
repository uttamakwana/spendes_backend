import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';

/** What happened on the credential surface. */
export enum AuthEventType {
  OtpRequested = 'otp_requested',
  Register = 'register',
  Login = 'login',
  Refresh = 'refresh',
  Logout = 'logout',
  /** An admin revoked the user's session from the back office. */
  SessionRevoked = 'session_revoked',
}

/**
 * One attempt on the auth surface — success or failure. Powers the admin "Auth
 * activity" view (support: "I never got my code", security: brute-force spotting).
 * Written best-effort by the auth controller; auto-expires after 90 days.
 */
export interface AuthEventDocument extends BaseDocument {
  _id: Types.ObjectId;
  type: AuthEventType;
  success: boolean;
  /** Set when the attempt resolved to a known account. */
  userId?: Types.ObjectId;
  dialCode?: string;
  phoneNumber?: string;
  /** The error message on failure (never the OTP itself). */
  reason?: string;
  statusCode?: number;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AUTH_EVENT_TTL_SECONDS = 90 * 24 * 60 * 60;

const authEventSchema = new Schema<AuthEventDocument>(
  {
    type: { type: String, enum: Object.values(AuthEventType), required: true },
    success: { type: Boolean, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    dialCode: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    reason: { type: String, trim: true, maxlength: 300 },
    statusCode: { type: Number },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true, collection: 'auth_events' },
);

authEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: AUTH_EVENT_TTL_SECONDS });
authEventSchema.index({ userId: 1, createdAt: -1 });
authEventSchema.index({ phoneNumber: 1, createdAt: -1 });
authEventSchema.index({ type: 1, success: 1, createdAt: -1 });

export const AuthEventModel = model<AuthEventDocument>('AuthEvent', authEventSchema);
