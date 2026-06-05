import { env, Environment, SmsProviderName } from './env';

export { Environment, SmsProviderName } from './env';

/**
 * Splits a comma-separated env value into a list, or returns the literal `*`
 * (used for CORS origins and allowed dial codes — `*` means "any").
 */
const toList = (raw: string): string[] | string => {
  const value = raw.trim();
  if (value === '*') {
    return '*';
  }
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

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
  length: number;
  ttlSeconds: number;
  maxAttempts: number;
  resendCooldownSeconds: number;
  mockEnabled: boolean;
  mockCode: string;
}

export interface SmsConfig {
  provider: SmsProviderName;
  from: string;
}

export interface PhoneConfig {
  defaultDialCode: string;
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

/** Strongly-typed shape of the entire application configuration tree. */
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

/**
 * The single, validated configuration object for the whole app. Import this
 * anywhere you need a setting — it is built once from the validated environment.
 */
export const config: AppConfiguration = {
  app: {
    env: env.NODE_ENV,
    port: env.PORT,
    name: env.APP_NAME,
    apiPrefix: env.API_PREFIX,
    apiVersion: env.API_VERSION,
    corsOrigins: toList(env.CORS_ORIGINS),
    logLevel: env.LOG_LEVEL,
    isProduction: env.NODE_ENV === Environment.Production,
    isDevelopment: env.NODE_ENV === Environment.Development,
  },
  database: {
    uri: env.MONGODB_URI,
    dbName: env.MONGODB_DB_NAME,
  },
  redis: {
    enabled: env.REDIS_ENABLED,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    keyPrefix: env.REDIS_KEY_PREFIX,
  },
  jwt: {
    access: { secret: env.JWT_ACCESS_SECRET, expiresIn: env.JWT_ACCESS_EXPIRES_IN },
    refresh: { secret: env.JWT_REFRESH_SECRET, expiresIn: env.JWT_REFRESH_EXPIRES_IN },
  },
  security: {
    bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
  },
  otp: {
    length: env.OTP_LENGTH,
    ttlSeconds: env.OTP_TTL_SECONDS,
    maxAttempts: env.OTP_MAX_ATTEMPTS,
    resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    mockEnabled: env.OTP_MOCK_ENABLED,
    mockCode: env.OTP_MOCK_CODE,
  },
  sms: {
    provider: env.SMS_PROVIDER,
    from: env.SMS_FROM,
  },
  phone: {
    defaultDialCode: env.PHONE_DEFAULT_DIAL_CODE,
    allowedDialCodes: toList(env.PHONE_ALLOWED_DIAL_CODES),
  },
  throttle: {
    ttl: env.THROTTLE_TTL,
    limit: env.THROTTLE_LIMIT,
  },
  swagger: {
    enabled: env.SWAGGER_ENABLED,
    path: env.SWAGGER_PATH,
  },
};
