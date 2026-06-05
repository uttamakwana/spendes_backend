import type { Request, Response } from 'express';
import type { ApiSuccessResponse, PageMeta, PaginatedData } from '../types/api-response';

/**
 * Writes the standard success envelope. This is the explicit Express equivalent
 * of NestJS's global `TransformInterceptor` — call it from a controller instead
 * of returning a value.
 *
 * @example
 * sendSuccess(res, req, user, 'Profile retrieved successfully');
 */
export function sendSuccess<T>(
  res: Response,
  req: Request,
  data: T,
  message = 'OK',
  statusCode = 200,
): Response<ApiSuccessResponse<T>> {
  const body: ApiSuccessResponse<T> = {
    success: true,
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    requestId: req.requestId,
  };
  return res.status(statusCode).json(body);
}

/** Builds pagination metadata from the raw counts. */
export function buildPageMeta(params: {
  page: number;
  limit: number;
  totalItems: number;
}): PageMeta {
  const totalPages = Math.max(1, Math.ceil(params.totalItems / params.limit));
  return {
    page: params.page,
    limit: params.limit,
    totalItems: params.totalItems,
    totalPages,
    hasPreviousPage: params.page > 1,
    hasNextPage: params.page < totalPages,
  };
}

/** Wraps a list of items + raw counts into the `{ items, meta }` page shape. */
export function paginate<T>(
  items: T[],
  params: { page: number; limit: number; totalItems: number },
): PaginatedData<T> {
  return { items, meta: buildPageMeta(params) };
}
