import { ApiProperty } from '@nestjs/swagger';

/**
 * Pagination metadata accompanying a page of results.
 */
export class PageMetaDto {
  @ApiProperty({ example: 1 })
  readonly page: number;

  @ApiProperty({ example: 20 })
  readonly limit: number;

  @ApiProperty({ example: 137 })
  readonly totalItems: number;

  @ApiProperty({ example: 7 })
  readonly totalPages: number;

  @ApiProperty({ example: false })
  readonly hasPreviousPage: boolean;

  @ApiProperty({ example: true })
  readonly hasNextPage: boolean;

  constructor(params: { page: number; limit: number; totalItems: number }) {
    this.page = params.page;
    this.limit = params.limit;
    this.totalItems = params.totalItems;
    this.totalPages = Math.max(1, Math.ceil(params.totalItems / params.limit));
    this.hasPreviousPage = params.page > 1;
    this.hasNextPage = params.page < this.totalPages;
  }
}

/**
 * Generic, serializable page of results. Services return this from list methods;
 * it becomes the `data` field of the standard API envelope.
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  readonly items: T[];

  @ApiProperty({ type: () => PageMetaDto })
  readonly meta: PageMetaDto;

  constructor(items: T[], meta: PageMetaDto) {
    this.items = items;
    this.meta = meta;
  }

  static of<T>(
    items: T[],
    params: { page: number; limit: number; totalItems: number },
  ): PaginatedResponseDto<T> {
    return new PaginatedResponseDto<T>(items, new PageMetaDto(params));
  }
}
