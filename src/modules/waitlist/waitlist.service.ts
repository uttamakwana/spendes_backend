import { createLogger } from '../../logger';
import { waitlistRepository, WaitlistRepository } from './waitlist.repository';
import type { JoinWaitlistInput } from './waitlist.validation';

export interface JoinWaitlistResult {
  email: string;
  /** True when this email was already on the list — the call is idempotent. */
  alreadyJoined: boolean;
  /** 1-based signup position, by join time. */
  position: number;
}

/**
 * Business logic for the public early-access waitlist. Joining is idempotent:
 * resubmitting an email never errors and never creates a duplicate, it just
 * reports the existing spot. This endpoint is unauthenticated, so it returns
 * nothing about an email beyond what the submitter already sent.
 */
export class WaitlistService {
  private readonly logger = createLogger('WaitlistService');

  constructor(private readonly repository: WaitlistRepository) {}

  async join(dto: JoinWaitlistInput): Promise<JoinWaitlistResult> {
    const alreadyJoined = await this.repository.exists({ email: dto.email });
    const entry = await this.repository.upsertByEmail(dto.email, dto.source ?? 'landing');
    const position = await this.repository.count({ createdAt: { $lte: entry.createdAt } });

    if (!alreadyJoined) {
      this.logger.info(`Waitlist signup #${position}: ${entry.email} (source: ${entry.source})`);
    }

    return { email: entry.email, alreadyJoined, position };
  }
}

/** Shared singleton instance used across the app. */
export const waitlistService = new WaitlistService(waitlistRepository);
