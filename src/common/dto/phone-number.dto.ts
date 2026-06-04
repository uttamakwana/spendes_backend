import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Shared phone-number contract. The dialing code and national number are kept
 * separate (see the User schema). `dialCode` is optional — the server falls back
 * to `PHONE_DEFAULT_DIAL_CODE` (+91) — while `phoneNumber` is the bare national
 * number. The 10-digit rule is the India MVP gate; per-country rules that vary by
 * length live in `PhoneService`, so widening this DTO is not needed to go global.
 */
export class PhoneNumberDto {
  @ApiPropertyOptional({
    example: '+91',
    default: '+91',
    description: 'Country dialing code with leading +. Defaults to +91 when omitted.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+\d{1,4}$/, { message: 'dialCode must look like +91' })
  dialCode?: string;

  @ApiProperty({
    example: '9876543210',
    description: '10-digit national number — no country code, spaces or symbols.',
  })
  @IsString()
  @Matches(/^\d{10}$/, { message: 'phoneNumber must be exactly 10 digits' })
  phoneNumber: string;
}
