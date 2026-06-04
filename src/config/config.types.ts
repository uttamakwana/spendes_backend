import { Environment } from './env.validation';

export interface AppConfig {
  env: Environment;
  port: number;
  name: string;
  apiPrefix: string;
  apiVersion: string;
  corsOrigins: string[] | string;
  logLevel: string;
  isProduction: boolean;
  isDevelopment: boolean;
}

export interface DatabaseConfig {
  uri: string;
  dbName?: string;
}

export interface RedisConfig {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
}

export interface JwtTokenConfig {
  secret: string;
  expiresIn: string;
}

export interface JwtConfig {
  access: JwtTokenConfig;
  refresh: JwtTokenConfig;
}

export interface SecurityConfig {
  bcryptSaltRounds: number;
}

export interface OtpConfig {
  /** Number of digits in a generated OTP. */
  length: number;
  /** How long a requested OTP remains valid, in seconds. */
  ttlSeconds: number;
  /** Maximum verify attempts before an OTP is invalidated. */
  maxAttempts: number;
  /** Minimum delay between two OTP requests for the same phone, in seconds. */
  resendCooldownSeconds: number;
  /**
   * When true, every OTP equals {@link mockCode} and is logged instead of sent.
   * Keep enabled for local/dev until a real SMS provider is configured.
   */
  mockEnabled: boolean;
  /** The fixed code used while {@link mockEnabled} is true. */
  mockCode: string;
}

/** Supported SMS gateways. Only `console` is wired today; others are placeholders. */
export type SmsProviderName = 'console' | 'twilio' | 'msg91';

export interface SmsConfig {
  provider: SmsProviderName;
  /** Sender id / from-number shown on the SMS. */
  from: string;
}

export interface PhoneConfig {
  /** Dial code assumed when a client omits one (India MVP). */
  defaultDialCode: string;
  /** Dial codes accepted at registration/login. `*` allows any (global mode). */
  allowedDialCodes: string[] | string;
}

export interface ThrottleConfig {
  ttl: number;
  limit: number;
}

export interface SwaggerConfig {
  enabled: boolean;
  path: string;
}

/**
 * Strongly-typed shape of the entire application configuration tree.
 * Inject via `ConfigService<AppConfiguration, true>` for fully-typed `.get()` calls.
 */
export interface AppConfiguration {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JwtConfig;
  security: SecurityConfig;
  otp: OtpConfig;
  sms: SmsConfig;
  phone: PhoneConfig;
  throttle: ThrottleConfig;
  swagger: SwaggerConfig;
}
