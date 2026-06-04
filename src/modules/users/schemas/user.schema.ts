import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../../common/enums/role.enum';
import { AbstractDocument } from '../../../database/abstract.schema';

export type UserDocument = HydratedDocument<User>;

/**
 * The primary identity is the phone number. It is stored split into the dialing
 * code (`dialCode`, e.g. `+91`) and the national `phoneNumber` (digits only) so
 * the same national number can coexist across countries when we go global —
 * uniqueness is enforced on the pair, not on the bare number. Email/password are
 * optional secondary details; authentication is OTP-based (see the auth module).
 */
@Schema({ timestamps: true, collection: 'users' })
export class User extends AbstractDocument {
  /** Country dialing code including the leading `+`, e.g. `+91`. */
  @Prop({ required: true, trim: true, default: '+91' })
  dialCode: string;

  /** National subscriber number, digits only — no country code, no separators. */
  @Prop({ required: true, trim: true })
  phoneNumber: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ type: [String], enum: Object.values(Role), default: [Role.User] })
  roles: Role[];

  @Prop({ default: 'INR', uppercase: true, trim: true })
  defaultCurrency: string;

  @Prop({ default: false })
  isPhoneVerified: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  /** Hash of the currently-valid refresh token (rotation/invalidation). */
  @Prop({ select: false })
  refreshTokenHash?: string;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// One account per (country, number). Compound so +91-98… and +1-98… can differ.
UserSchema.index({ dialCode: 1, phoneNumber: 1 }, { unique: true });

// Email is optional but unique when present (sparse skips documents without one).
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
