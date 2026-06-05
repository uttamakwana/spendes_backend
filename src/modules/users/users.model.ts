import { model, Schema, type Types } from 'mongoose';
import { Role } from '../../common/enums/role';
import type { BaseDocument } from '../../database/base.repository';

/**
 * The primary identity is the phone number, stored split into the dialing code
 * (`dialCode`, e.g. `+91`) and the national `phoneNumber` (digits only) so the same
 * national number can coexist across countries when we go global — uniqueness is
 * enforced on the pair, not the bare number. Email is an optional secondary detail;
 * authentication is OTP-based (see the auth module).
 */
export interface UserDocument extends BaseDocument {
  _id: Types.ObjectId;
  dialCode: string;
  phoneNumber: string;
  email?: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  roles: Role[];
  defaultCurrency: string;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isActive: boolean;
  /** Hash of the currently-valid refresh token (rotation/invalidation). Excluded by default. */
  refreshTokenHash?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    dialCode: { type: String, required: true, trim: true, default: '+91' },
    phoneNumber: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    avatarUrl: { type: String },
    roles: { type: [String], enum: Object.values(Role), default: [Role.User] },
    defaultCurrency: { type: String, default: 'INR', uppercase: true, trim: true },
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    refreshTokenHash: { type: String, select: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, collection: 'users' },
);

// One account per (country, number). Compound so +91-98… and +1-98… can differ.
userSchema.index({ dialCode: 1, phoneNumber: 1 }, { unique: true });

// Email is optional but unique when present (sparse skips documents without one).
userSchema.index({ email: 1 }, { unique: true, sparse: true });

export const UserModel = model<UserDocument>('User', userSchema);
