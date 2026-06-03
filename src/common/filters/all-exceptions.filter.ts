import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import type { MongoServerError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';
import { REQUEST_ID_HEADER } from '../constants';
import { ApiErrorResponse } from '../interfaces';

interface NormalizedError {
  status: number;
  message: string;
  errorCode: string;
  errors?: unknown;
}

/**
 * Catch-all exception filter that converts every thrown error — Nest HTTP
 * exceptions, Mongoose/Mongo errors and unexpected failures — into the single,
 * consistent {@link ApiErrorResponse} envelope. 5xx errors are logged with a
 * stack trace; their internals are never leaked to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();

    const normalized = this.normalize(exception);

    const body: ApiErrorResponse = {
      success: false,
      statusCode: normalized.status,
      message: normalized.message,
      errorCode: normalized.errorCode,
      errors: normalized.errors,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: (request.headers[REQUEST_ID_HEADER] as string) || undefined,
    };

    const logLine = `${request.method} ${request.url} -> ${normalized.status} ${normalized.message}`;
    if (normalized.status >= 500) {
      this.logger.error(logLine, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(logLine);
    }

    httpAdapter.reply(ctx.getResponse(), body, normalized.status);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      const errorCode = this.codeForStatus(status);

      if (typeof response === 'object' && response !== null) {
        const payload = response as Record<string, unknown>;
        const rawMessage = payload.message;

        // Array of messages → class-validator field errors.
        if (Array.isArray(rawMessage)) {
          return { status, message: 'Validation failed', errorCode, errors: rawMessage };
        }

        // Simple string message → the common HttpException shape.
        if (typeof rawMessage === 'string') {
          return { status, message: rawMessage, errorCode };
        }

        // Structured payload without a string message (e.g. Terminus health
        // results) → preserve the full detail under `errors`.
        return { status, message: exception.message, errorCode, errors: payload };
      }

      return { status, message: exception.message, errorCode };
    }

    if (exception instanceof MongooseError.ValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errorCode: 'VALIDATION_ERROR',
        errors: Object.values(exception.errors).map((err) => err.message),
      };
    }

    if (exception instanceof MongooseError.CastError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: `Invalid value for field "${exception.path}"`,
        errorCode: 'INVALID_IDENTIFIER',
      };
    }

    if (this.isMongoServerError(exception) && exception.code === 11000) {
      const fields = Object.keys(exception.keyValue ?? {}).join(', ');
      return {
        status: HttpStatus.CONFLICT,
        message: `A record with the same ${fields || 'value'} already exists`,
        errorCode: 'DUPLICATE_KEY',
        errors: exception.keyValue,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      errorCode: 'INTERNAL_SERVER_ERROR',
    };
  }

  private isMongoServerError(error: unknown): error is MongoServerError {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'MongoServerError'
    );
  }

  private codeForStatus(status: number): string {
    return HttpStatus[status] ?? 'ERROR';
  }
}
