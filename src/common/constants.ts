/** Header carrying the per-request correlation id (echoed back on every response). */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Default request timeout (ms) enforced by the timeout middleware. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
