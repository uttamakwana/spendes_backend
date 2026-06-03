import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

/**
 * Profile-update payload. Email and password are intentionally excluded — those
 * change via dedicated, security-sensitive flows (verify email / change password).
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['email', 'password'] as const),
) {}
