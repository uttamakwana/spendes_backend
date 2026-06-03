/**
 * The standard success envelope returned by the TransformInterceptor.
 * Every successful JSON response in the API conforms to this shape.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
  requestId?: string;
}

/**
 * The standard error envelope returned by the AllExceptionsFilter.
 */
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  /** Field-level validation details or additional error context. */
  errors?: unknown;
  /** Stable, machine-readable error code (e.g. "VALIDATION_ERROR"). */
  errorCode?: string;
  timestamp: string;
  path: string;
  requestId?: string;
}
