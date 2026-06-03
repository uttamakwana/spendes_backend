import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

/**
 * Reusable query parameters for any paginated, sortable, searchable list endpoint.
 * Extend this in feature modules to add resource-specific filters.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional({ description: 'Field to sort by' })
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.Desc })
  @IsEnum(SortOrder)
  @IsOptional()
  sortOrder: SortOrder = SortOrder.Desc;

  @ApiPropertyOptional({ description: 'Free-text search term' })
  @IsString()
  @IsOptional()
  search?: string;

  /** Number of documents to skip — derived from page/limit. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  /** Mongoose-compatible sort object, or undefined when no sort requested. */
  get sort(): Record<string, 1 | -1> | undefined {
    if (!this.sortBy) {
      return undefined;
    }
    return { [this.sortBy]: this.sortOrder === SortOrder.Asc ? 1 : -1 };
  }
}
