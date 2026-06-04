import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthTokensDto {
  @ApiProperty({ description: 'Short-lived JWT for authenticating API requests' })
  accessToken: string;

  @ApiProperty({ description: 'Long-lived JWT used to obtain new access tokens' })
  refreshToken: string;

  @ApiProperty({ example: 'Bearer', default: 'Bearer' })
  tokenType: string;

  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 })
  expiresIn: number;
}

export class AuthResponseDto {
  @ApiProperty({ type: () => UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({ type: () => AuthTokensDto })
  tokens: AuthTokensDto;
}

/** Response to a successful OTP request — no code is ever returned over the wire. */
export class OtpRequestResponseDto {
  @ApiProperty({
    description: 'Whether this phone already has an account (route to login vs register).',
    example: false,
  })
  isRegistered: boolean;

  @ApiProperty({ description: 'Seconds until the issued code expires', example: 300 })
  expiresInSeconds: number;

  @ApiProperty({
    description: 'True in dev when the code is mocked (fixed 123456) rather than sent.',
    example: true,
  })
  mocked: boolean;
}
