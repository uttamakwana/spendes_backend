/**
 * Reflector metadata keys and shared, app-wide constants.
 * Keep these centralized so decorators, guards and interceptors agree on keys.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const RESPONSE_MESSAGE_KEY = 'responseMessage';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Default request timeout (ms) enforced by the TimeoutInterceptor. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
