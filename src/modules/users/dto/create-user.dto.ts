import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PhoneNumberDto } from '../../../common/dto/phone-number.dto';

/**
 * Profile data captured when an account is first created (after OTP verification).
 * Inherits `dialCode` + `phoneNumber` from {@link PhoneNumberDto}. There is no
 * password — authentication is OTP-based.
 */
export class CreateUserDto extends PhoneNumberDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MaxLength(50)
  lastName: string;

  @ApiPropertyOptional({ example: 'jane.doe@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'INR', default: 'INR', minLength: 3, maxLength: 3 })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  defaultCurrency?: string;
}
