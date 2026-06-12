import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';
import { DevicePlatform } from './push.enums';

/**
 * One Expo push token for one device belonging to one user. A user may own many
 * (phone + tablet, reinstalls), so the recipient set for a notification is "every
 * token for `userId`". `token` is globally unique: registering the same device
 * under a different account simply re-points the row (upsert), and a token Expo
 * reports as `DeviceNotRegistered` is pruned. These rows are best-effort delivery
 * targets — the notifications collection remains the source of truth.
 */
export interface PushTokenDocument extends BaseDocument {
  _id: Types.ObjectId;
  /** Owner — the user whose notifications are delivered to this device. */
  userId: Types.ObjectId;
  /** The ExpoPushToken (`ExponentPushToken[…]`). Unique across all users. */
  token: string;
  platform: DevicePlatform;
  createdAt: Date;
  updatedAt: Date;
}

const pushTokenSchema = new Schema<PushTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true, trim: true },
    platform: { type: String, enum: Object.values(DevicePlatform), required: true },
  },
  { timestamps: true, collection: 'push_tokens' },
);

export const PushTokenModel = model<PushTokenDocument>('PushToken', pushTokenSchema);
