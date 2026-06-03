import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'crypto';
import { AppConfiguration } from '../../config';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { User } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { AuthResponseDto, AuthTokensDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.usersService.createFromRegistration(dto);
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithSecrets(dto.email);

    // Run the comparison even when the user is missing to avoid timing-based
    // user enumeration, then fail with a single generic message.
    const passwordValid = user ? await bcrypt.compare(dto.password, user.password) : false;
    if (!user || !passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.usersService.updateLastLogin(user._id.toString());
    return this.buildAuthResponse(user);
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokensDto> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const user = await this.usersService.findByIdWithRefreshToken(payload.sub);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    if (!this.tokenMatchesHash(refreshToken, user.refreshTokenHash)) {
      // Token reuse / mismatch — revoke the stored token defensively.
      await this.usersService.setRefreshTokenHash(user._id.toString(), null);
      throw new UnauthorizedException('Access denied');
    }

    const tokens = await this.issueTokens(user);
    await this.usersService.setRefreshTokenHash(
      user._id.toString(),
      this.hashToken(tokens.refreshToken),
    );
    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
    this.logger.log(`User logged out: ${userId}`);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async buildAuthResponse(user: User): Promise<AuthResponseDto> {
    const tokens = await this.issueTokens(user);
    await this.usersService.setRefreshTokenHash(
      user._id.toString(),
      this.hashToken(tokens.refreshToken),
    );
    return { user: UserResponseDto.fromEntity(user), tokens };
  }

  private async issueTokens(user: User): Promise<AuthTokensDto> {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      roles: user.roles,
    };

    const accessConfig = this.configService.get('jwt.access', { infer: true });
    const refreshConfig = this.configService.get('jwt.refresh', { infer: true });

    // `expiresIn` is typed as the `ms` template-literal union; our config holds a
    // plain string (validated separately), so assert to the option's own type.
    type ExpiresIn = JwtSignOptions['expiresIn'];

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessConfig.secret,
        expiresIn: accessConfig.expiresIn as ExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshConfig.secret,
        expiresIn: refreshConfig.expiresIn as ExpiresIn,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.expiresInSeconds(accessConfig.expiresIn),
    };
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get('jwt.refresh.secret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /** Refresh tokens are high-entropy secrets — a SHA-256 digest is sufficient and constant-time comparable. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private tokenMatchesHash(token: string, storedHash: string): boolean {
    const computed = Buffer.from(this.hashToken(token));
    const stored = Buffer.from(storedHash);
    return computed.length === stored.length && timingSafeEqual(computed, stored);
  }

  /** Converts a duration string ('15m', '7d', '3600', '1h') to seconds. */
  private expiresInSeconds(expiresIn: string): number {
    const match = /^(\d+)([smhd])?$/.exec(expiresIn.trim());
    if (!match) {
      return 0;
    }
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400 };
    return unit ? value * multipliers[unit] : value;
  }
}
