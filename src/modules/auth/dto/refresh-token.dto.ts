import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'A valid, unexpired refresh token' })
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refreshToken: string;
}
