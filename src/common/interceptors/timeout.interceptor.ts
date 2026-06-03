import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../constants';

/**
 * Aborts requests that exceed {@link DEFAULT_REQUEST_TIMEOUT_MS}, turning a hung
 * handler into a clean 408 instead of an indefinitely open connection.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(DEFAULT_REQUEST_TIMEOUT_MS),
      catchError((error: unknown) => {
        if (error instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException('Request processing timed out'));
        }
        return throwError(() => error);
      }),
    );
  }
}
