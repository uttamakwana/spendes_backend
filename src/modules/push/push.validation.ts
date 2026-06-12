import { z } from 'zod';
import { DevicePlatform } from './push.enums';

/** Body for `POST /push/register` — an Expo push token plus the device platform. */
export const registerPushTokenSchema = z.object({
  token: z.string().trim().min(1, 'token is required'),
  platform: z.nativeEnum(DevicePlatform),
});
export type RegisterPushTokenBody = z.infer<typeof registerPushTokenSchema>;

/** Body for `POST /push/unregister` — the token to detach from the account. */
export const unregisterPushTokenSchema = z.object({
  token: z.string().trim().min(1, 'token is required'),
});
export type UnregisterPushTokenBody = z.infer<typeof unregisterPushTokenSchema>;
