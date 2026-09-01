import type { Role } from '../../common/enums/role';
import { PlanType } from '../../common/enums/plan-type';
import type { PaymentHandleType } from '../../common/reference/countries';
import {
  resolveNotificationPreferences,
  type NotificationPreferences,
  type UserDocument,
} from './users.model';

/**
 * The public-facing representation of a user. Built explicitly via
 * {@link toUserResponse} so sensitive fields (the refresh-token hash) can never leak.
 */
export interface UserResponse {
  id: string;
  dialCode: string;
  phoneNumber: string;
  /** Full E.164 number for display, e.g. `+919876543210`. */
  phoneE164: string;
  email?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl?: string;
  roles: Role[];
  plan: PlanType;
  /** How this user gets paid back: the rail and the handle on it. */
  paymentHandle?: { type: PaymentHandleType; value: string };
  /** ISO 3166-1 alpha-2 — drives currency, phone rule and settle-up rail. */
  country: string;
  /** IANA zone, so "this month" means their month. */
  timezone: string;
  notificationPreferences: NotificationPreferences;
  defaultCurrency: string;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a raw user document to its safe, public response shape. */
export function toUserResponse(user: UserDocument): UserResponse {
  return {
    id: user._id.toString(),
    dialCode: user.dialCode,
    phoneNumber: user.phoneNumber,
    phoneE164: `${user.dialCode}${user.phoneNumber}`,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    avatarUrl: user.avatarUrl,
    roles: user.roles,
    plan: user.plan ?? PlanType.Free,
    paymentHandle: user.paymentHandle
      ? { type: user.paymentHandle.type, value: user.paymentHandle.value }
      : undefined,
    country: user.country ?? 'IN',
    timezone: user.timezone ?? 'Asia/Kolkata',
    notificationPreferences: resolveNotificationPreferences(user.notificationPreferences),
    defaultCurrency: user.defaultCurrency,
    isPhoneVerified: user.isPhoneVerified,
    isEmailVerified: user.isEmailVerified,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
