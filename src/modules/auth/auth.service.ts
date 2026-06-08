import { createHash, timingSafeEqual } from 'crypto';
import { config } from '../../config';
import { NotFoundException, UnauthorizedException } from '../../common/errors/http-exception';
import { createLogger } from '../../logger';
import { toUserResponse, type UserResponse } from '../users/user-response';
import type { UserDocument } from '../users/users.model';
import { usersService, UsersService } from '../users/users.service';
import { groupsService } from '../groups/groups.service';
import { jwtService, JwtService, type JwtPayload } from './jwt.service';
import { otpService, OtpService } from './otp/otp.service';
import { phoneService, PhoneService } from './phone/phone.service';
import type { LoginInput, RegisterInput, RequestOtpInput } from './auth.validation';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

export interface AuthResponse {
  user: UserResponse;
  tokens: AuthTokens;
}

/** Response to a successful OTP request — no code is ever returned over the wire. */
export interface OtpRequestResponse {
  isRegistered: boolean;
  expiresInSeconds: number;
  mocked: boolean;
}

export class AuthService {
  private readonly logger = createLogger('AuthService');

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly phone: PhoneService,
    private readonly otp: OtpService,
  ) {}

  /**
   * Sends a one-time code to the phone. Works for both new and returning users;
   * `isRegistered` lets the client route to the register or login screen.
   */
  async requestOtp(dto: RequestOtpInput): Promise<OtpRequestResponse> {
    const phone = this.phone.normalize(dto);
    const existing = await this.users.findByPhone(phone.dialCode, phone.phoneNumber);
    const result = await this.otp.request(phone);

    return {
      isRegistered: existing !== null,
      expiresInSeconds: result.expiresInSeconds,
      mocked: result.mocked,
    };
  }

  /** Verifies the OTP and provisions a brand-new account. */
  async register(dto: RegisterInput): Promise<AuthResponse> {
    const phone = this.phone.normalize(dto);
    await this.otp.verify(phone, dto.otp);

    const user = await this.users.createFromRegistration({
      dialCode: phone.dialCode,
      phoneNumber: phone.phoneNumber,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      defaultCurrency: dto.defaultCurrency,
      isPhoneVerified: true,
    });

    // Promote any group invites that were waiting on this phone number (non-fatal).
    await groupsService.linkInvitesForUser(user);

    return this.buildAuthResponse(user);
  }

  /** Verifies the OTP for an existing account and issues a token pair. */
  async login(dto: LoginInput): Promise<AuthResponse> {
    const phone = this.phone.normalize(dto);

    const user = await this.users.findByPhoneWithSecrets(phone.dialCode, phone.phoneNumber);
    if (!user) {
      throw new NotFoundException('No account found for this number. Please register first.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.otp.verify(phone, dto.otp);

    await this.users.updateLastLogin(user._id.toString());
    // Reflect the just-written login time in the response (entity was loaded before).
    user.lastLoginAt = new Date();

    return this.buildAuthResponse(user);
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const payload = this.verifyRefreshToken(refreshToken);

    const user = await this.users.findByIdWithRefreshToken(payload.sub);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    if (!this.tokenMatchesHash(refreshToken, user.refreshTokenHash)) {
      // Token reuse / mismatch — revoke the stored token defensively.
      await this.users.setRefreshTokenHash(user._id.toString(), null);
      throw new UnauthorizedException('Access denied');
    }

    const tokens = this.issueTokens(user);
    await this.users.setRefreshTokenHash(user._id.toString(), this.hashToken(tokens.refreshToken));
    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.users.setRefreshTokenHash(userId, null);
    this.logger.info(`User logged out: ${userId}`);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async buildAuthResponse(user: UserDocument): Promise<AuthResponse> {
    const tokens = this.issueTokens(user);
    await this.users.setRefreshTokenHash(user._id.toString(), this.hashToken(tokens.refreshToken));
    return { user: toUserResponse(user), tokens };
  }

  private issueTokens(user: UserDocument): AuthTokens {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      roles: user.roles,
    };

    const accessConfig = config.jwt.access;
    const refreshConfig = config.jwt.refresh;

    const accessToken = this.jwt.sign(payload, accessConfig.secret, accessConfig.expiresIn);
    const refreshToken = this.jwt.sign(payload, refreshConfig.secret, refreshConfig.expiresIn);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.expiresInSeconds(accessConfig.expiresIn),
    };
  }

  private verifyRefreshToken(token: string): JwtPayload {
    try {
      return this.jwt.verify(token, config.jwt.refresh.secret);
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

export const authService = new AuthService(usersService, jwtService, phoneService, otpService);
