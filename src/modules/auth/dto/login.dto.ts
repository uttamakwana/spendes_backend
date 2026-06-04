import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { PhoneNumberDto } from '../../../common/dto/phone-number.dto';

/**
 * Login for an existing account: phone identity + the OTP just received.
 * (Request the code first via `POST /auth/otp/request`.)
 */
export class LoginDto extends PhoneNumberDto {
  @ApiProperty({ example: '123456', description: 'The one-time code sent over SMS.' })
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'otp must be 4-8 digits' })
  otp: string;
}
