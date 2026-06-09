import { config } from '../../config';
import { createLogger } from '../../logger';
import { sendExpoPush, type ExpoPushMessage } from './expo-push.client';
import { DevicePlatform } from './push.enums';
import { pushTokensRepository, PushTokensRepository } from './push.repository';

/** The deep-link payload a tap carries back into the app (mirrors the in-app inbox). */
export interface PushData {
  type?: string;
  notificationId?: string;
  /** Group/friendship id the tap should open — `isDirect` chooses /friends vs /groups. */
  groupId?: string;
  isDirect?: boolean;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: PushData;
}

/**
 * Device push delivery via Expo's push service. Registration is owner-scoped;
 * delivery fans a single notification out to every device a user owns. Like the
 * in-app emitters in {@link NotificationsService}, `sendToUser` is strictly
 * best-effort — it never throws into the social engine — and it self-heals by
 * pruning tokens Expo reports dead.
 */
export class PushService {
  private readonly logger = createLogger('PushService');

  constructor(private readonly repository: PushTokensRepository) {}

  registerToken(userId: string, token: string, platform: DevicePlatform): Promise<void> {
    return this.repository.upsert(userId, token, platform);
  }

  unregisterToken(userId: string, token: string): Promise<void> {
    return this.repository.removeOwned(userId, token);
  }

  /** Pushes a notification to all of a user's devices. Best-effort; never throws. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    try {
      const tokens = await this.repository.findByUser(userId);
      if (tokens.length === 0) return;

      const messages: ExpoPushMessage[] = tokens.map((t) => ({
        to: t.token,
        title: payload.title,
        body: payload.body,
        data: payload.data as Record<string, unknown> | undefined,
        sound: 'default',
        channelId: t.platform === DevicePlatform.Android ? 'default' : undefined,
      }));

      const tickets = await sendExpoPush(messages, config.push.expoAccessToken);

      // Prune tokens Expo says are dead so we stop trying to notify them.
      const dead: string[] = [];
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          dead.push(messages[i].to);
        }
      });
      await this.repository.removeMany(dead);
    } catch (error) {
      this.logger.warn(`Failed to send push to user ${userId}: ${(error as Error).message}`);
    }
  }
}

/** Shared singleton instance used across the app. */
export const pushService = new PushService(pushTokensRepository);
