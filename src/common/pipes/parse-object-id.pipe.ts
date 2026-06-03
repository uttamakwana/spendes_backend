import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Validates that a route/query param is a well-formed Mongo ObjectId and returns
 * it as a `Types.ObjectId`. Rejects malformed identifiers with a 400 before they
 * ever reach a service or the database.
 *
 * @example
 * findOne(\@Param('id', ParseObjectIdPipe) id: Types.ObjectId) { ... }
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, Types.ObjectId> {
  transform(value: string): Types.ObjectId {
    if (!OBJECT_ID_PATTERN.test(value)) {
      throw new BadRequestException(`"${value}" is not a valid identifier`);
    }
    return new Types.ObjectId(value);
  }
}
