import type { Request } from 'express';
import { Types } from 'mongoose';
import { createLogger } from '../../logger';
import { AuthEventModel, type AuthEventType } from './auth-event.model';

export interface AuthEventInput {
  type: AuthEventType;
  success: boolean;
  userId?: string;
  dialCode?: string;
  phoneNumber?: string;
  reason?: string;
  statusCode?: number;
}

/**
 * Best-effort recorder for the auth-activity log. Never throws — a logging hiccup
 * must never fail (or slow down) a login.
 */
class AuthEventsService {
  private readonly logger = createLogger('AuthEventsService');

  record(req: Request | null, input: AuthEventInput): void {
    const doc = {
      ...input,
      userId: input.userId && Types.ObjectId.isValid(input.userId) ? input.userId : undefined,
      phoneNumber: input.phoneNumber?.replace(/\D/g, ''),
      reason: input.reason?.slice(0, 300),
      ip: req?.ip,
      userAgent: req?.get('user-agent')?.slice(0, 300),
    };
    AuthEventModel.create(doc).catch((error: Error) =>
      this.logger.warn(`Failed to record auth event: ${error.message}`),
    );
  }
}

export const authEventsService = new AuthEventsService();
