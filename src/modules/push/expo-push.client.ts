import { createLogger } from '../../logger';

/** Expo's push HTTP endpoint and per-request message cap. */
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const MAX_MESSAGES_PER_REQUEST = 100;

/** A single message addressed to one Expo push token. */
export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  /** Android notification channel — must match a channel created on the client. */
  channelId?: string;
}

/** One ticket Expo returns per message, in request order. */
export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const logger = createLogger('ExpoPushClient');

/** Splits an array into fixed-size chunks. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Sends messages to Expo's push service and returns the flat list of tickets,
 * aligned with the input order across chunks. Pure transport — it knows nothing
 * about the database or users. When an access token is configured (Expo's
 * "enhanced security" option) it is sent as a bearer credential. Never throws:
 * a failed chunk yields error tickets so the caller can still prune dead tokens
 * without the whole send aborting.
 */
export async function sendExpoPush(
  messages: ExpoPushMessage[],
  accessToken?: string,
): Promise<ExpoPushTicket[]> {
  const tickets: ExpoPushTicket[] = [];

  for (const batch of chunk(messages, MAX_MESSAGES_PER_REQUEST)) {
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(batch),
      });

      const payload = (await response.json()) as { data?: ExpoPushTicket[]; errors?: unknown };
      if (Array.isArray(payload.data)) {
        tickets.push(...payload.data);
      } else {
        logger.warn(`Expo push returned no ticket data: ${JSON.stringify(payload.errors ?? {})}`);
        batch.forEach(() => tickets.push({ status: 'error' }));
      }
    } catch (error) {
      logger.warn(`Expo push request failed: ${(error as Error).message}`);
      batch.forEach(() => tickets.push({ status: 'error' }));
    }
  }

  return tickets;
}
