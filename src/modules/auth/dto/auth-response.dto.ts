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
