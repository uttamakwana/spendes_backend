import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../../common/enums/role.enum';
import { AbstractDocument } from '../../../database/abstract.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User extends AbstractDocument {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  /** Bcrypt hash. Never selected by default — must be explicitly requested. */
  @Prop({ required: true, select: false })
  password: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ trim: true })
  phoneNumber?: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ type: [String], enum: Object.values(Role), default: [Role.User] })
  roles: Role[];

  @Prop({ default: 'INR', uppercase: true, trim: true })
  defaultCurrency: string;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  /** Hash of the currently-valid refresh token (rotation/invalidation). */
  @Prop({ select: false })
  refreshTokenHash?: string;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
