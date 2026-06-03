import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PageMetaDto } from '../dto/pagination-response.dto';

/**
 * Documents a paginated list endpoint in Swagger, wrapping the model in the
 * standard success envelope with `{ items, meta }` data.
 *
 * @example
 * \@ApiPaginatedResponse(UserResponseDto)
 * \@Get()
 * findAll(\@Query() query: PaginationQueryDto) { ... }
 */
export const ApiPaginatedResponse = <TModel extends Type<unknown>>(model: TModel) =>
  applyDecorators(
    ApiExtraModels(PageMetaDto, model),
    ApiOkResponse({
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: 200 },
          message: { type: 'string', example: 'OK' },
          timestamp: { type: 'string', format: 'date-time' },
          path: { type: 'string', example: '/api/v1/resource' },
          data: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
              meta: { $ref: getSchemaPath(PageMetaDto) },
            },
          },
        },
      },
    }),
  );
