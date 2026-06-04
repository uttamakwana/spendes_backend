import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { CreateUserDto } from '../../users/dto/create-user.dto';

/**
 * First-time registration: the phone identity + profile (from {@link CreateUserDto})
 * plus the OTP proving the caller controls the number. Fails if the number is
 * already registered — returning users should call `POST /auth/login` instead.
 */
export class RegisterDto extends CreateUserDto {
  @ApiProperty({ example: '123456', description: 'The one-time code sent over SMS.' })
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'otp must be 4-8 digits' })
  otp: string;
}
