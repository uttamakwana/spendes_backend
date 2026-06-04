import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AbstractDocument } from '../../../../database/abstract.schema';

export type OtpCodeDocument = HydratedDocument<OtpCode>;

/**
 * A short-lived, one-time verification code tied to a phone identity. The code
 * itself is never stored — only a bcrypt hash — and the document auto-expires via
 * a TTL index so stale codes clean themselves up. At most one active code exists
 * per phone (the request flow clears prior ones).
 */
@Schema({ timestamps: true, collection: 'otp_codes' })
export class OtpCode extends AbstractDocument {
  @Prop({ required: true, trim: true })
  dialCode: string;

  @Prop({ required: true, trim: true })
  phoneNumber: string;

  /** Bcrypt hash of the issued code. */
  @Prop({ required: true })
  codeHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: 0 })
  attempts: number;
}

export const OtpCodeSchema = SchemaFactory.createForClass(OtpCode);

// TTL: Mongo removes the document once `expiresAt` passes (sweep runs ~every 60s).
OtpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Fast lookup of the latest code for a phone.
OtpCodeSchema.index({ dialCode: 1, phoneNumber: 1, createdAt: -1 });
