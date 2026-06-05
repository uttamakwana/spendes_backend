/**
 * Base class for every error that maps to a specific HTTP status. Thrown anywhere
 * in a controller/service (or passed to `next()`), it is converted into the
 * standard error envelope by the central error handler. This replaces NestJS's
 * built-in `HttpException` family with a tiny, dependency-free equivalent.
 */
export class HttpException extends Error {
  readonly status: number;
  /** Stable, machine-readable code (e.g. "NOT_FOUND"). */
  readonly errorCode: string;
  /** Optional field-level details (e.g. validation errors). */
  readonly errors?: unknown;

  constructor(status: number, message: string, options?: { errorCode?: string; errors?: unknown }) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.errorCode = options?.errorCode ?? defaultErrorCode(status);
    this.errors = options?.errors;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad request', errors?: unknown) {
    super(400, message, { errorCode: 'BAD_REQUEST', errors });
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized') {
    super(401, message, { errorCode: 'UNAUTHORIZED' });
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden') {
    super(403, message, { errorCode: 'FORBIDDEN' });
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not found') {
    super(404, message, { errorCode: 'NOT_FOUND' });
  }
}

export class RequestTimeoutException extends HttpException {
  constructor(message = 'Request timeout') {
    super(408, message, { errorCode: 'REQUEST_TIMEOUT' });
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict') {
    super(409, message, { errorCode: 'CONFLICT' });
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(message = 'Too many requests') {
    super(429, message, { errorCode: 'TOO_MANY_REQUESTS' });
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message = 'Internal server error') {
    super(500, message, { errorCode: 'INTERNAL_SERVER_ERROR' });
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(message = 'Service unavailable', errors?: unknown) {
    super(503, message, { errorCode: 'SERVICE_UNAVAILABLE', errors });
  }
}

/** Maps an HTTP status to a default machine-readable error code. */
function defaultErrorCode(status: number): string {
  const codes: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    408: 'REQUEST_TIMEOUT',
    409: 'CONFLICT',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };
  return codes[status] ?? 'ERROR';
}
