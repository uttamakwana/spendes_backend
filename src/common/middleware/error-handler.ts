import type { NextFunction, Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import { ZodError } from 'zod';
import { createLogger } from '../../logger';
import { HttpException } from '../errors/http-exception';
import type { ApiErrorResponse } from '../types/api-response';

const logger = createLogger('ErrorHandler');

interface NormalizedError {
  status: number;
  message: string;
  errorCode: string;
  errors?: unknown;
}

interface MongoServerError {
  name: string;
  code?: number;
  keyValue?: Record<string, unknown>;
}

const isMongoServerError = (error: unknown): error is MongoServerError =>
  typeof error === 'object' &&
  error !== null &&
  (error as MongoServerError).name === 'MongoServerError';

/**
 * Converts any thrown error — our `HttpException` family, Zod validation errors,
 * Mongoose/Mongo errors and unexpected failures — into the single, consistent
 * {@link ApiErrorResponse} envelope. 5xx errors are logged with a stack trace;
 * their internals are never leaked to the client. Replaces NestJS's
 * `AllExceptionsFilter`.
 *
 * Must be registered LAST, after all routes, and keep all four parameters so
 * Express recognises it as an error handler.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,

  _next: NextFunction,
): void {
  const normalized = normalize(error);

  const body: ApiErrorResponse = {
    success: false,
    statusCode: normalized.status,
    message: normalized.message,
    errorCode: normalized.errorCode,
    errors: normalized.errors,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    requestId: req.requestId,
  };

  const logLine = `${req.method} ${req.originalUrl} -> ${normalized.status} ${normalized.message}`;
  if (normalized.status >= 500) {
    logger.error({ err: error }, logLine);
  } else {
    logger.warn(logLine);
  }

  // If a response was already partially sent, delegate to Express's default.
  if (res.headersSent) {
    return;
  }

  res.status(normalized.status).json(body);
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof HttpException) {
    return {
      status: error.status,
      message: error.message,
      errorCode: error.errorCode,
      errors: error.errors,
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      message: 'Validation failed',
      errorCode: 'VALIDATION_ERROR',
      errors: error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    };
  }

  if (error instanceof MongooseError.ValidationError) {
    return {
      status: 400,
      message: 'Validation failed',
      errorCode: 'VALIDATION_ERROR',
      errors: Object.values(error.errors).map((err) => err.message),
    };
  }

  if (error instanceof MongooseError.CastError) {
    return {
      status: 400,
      message: `Invalid value for field "${error.path}"`,
      errorCode: 'INVALID_IDENTIFIER',
    };
  }

  if (isMongoServerError(error) && error.code === 11000) {
    const fields = Object.keys(error.keyValue ?? {}).join(', ');
    return {
      status: 409,
      message: `A record with the same ${fields || 'value'} already exists`,
      errorCode: 'DUPLICATE_KEY',
      errors: error.keyValue,
    };
  }

  return {
    status: 500,
    message: 'Internal server error',
    errorCode: 'INTERNAL_SERVER_ERROR',
  };
}
