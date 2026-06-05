import type { AuthenticatedUser } from './authenticated-user';

/**
 * Augments the Express request with app-specific properties:
 * - `user`      — the authenticated principal, set by the `authenticate` middleware.
 * - `requestId` — the per-request correlation id, set by the `requestId` middleware.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
    }
  }
}

export {};
