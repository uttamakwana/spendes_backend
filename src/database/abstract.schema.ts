import { Prop, Schema } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';

/**
 * Base class for all persisted documents. Concrete schemas should extend this
 * and be declared with `@Schema({ timestamps: true })` so `createdAt`/`updatedAt`
 * are managed automatically.
 */
@Schema()
export abstract class AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId })
  _id: Types.ObjectId;

  createdAt?: Date;

  updatedAt?: Date;
}
