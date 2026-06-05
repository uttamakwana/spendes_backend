/**
 * The standard success envelope returned by {@link sendSuccess}.
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
 * The standard error envelope returned by the central error handler.
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

/** Pagination metadata accompanying a page of results. */
export interface PageMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** A page of results — becomes the `data` field of the success envelope. */
export interface PaginatedData<T> {
  items: T[];
  meta: PageMeta;
}
