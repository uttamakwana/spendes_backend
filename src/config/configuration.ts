import { AppConfiguration, SmsProviderName } from './config.types';
import { Environment } from './env.validation';

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toList = (value: string | undefined, fallback: string): string[] | string => {
  const raw = (value ?? fallback).trim();
  if (raw === '*') {
    return '*';
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

/**
 * Builds the typed configuration tree from validated environment variables.
 * Loaded by `ConfigModule.forRoot({ load: [configuration] })`.
 */
export default (): AppConfiguration => {
  const env = (process.env.NODE_ENV as Environment) ?? Environment.Development;

  return {
    app: {
      env,
      port: toInt(process.env.PORT, 3000),
      name: process.env.APP_NAME ?? 'Spendes API',
      apiPrefix: process.env.API_PREFIX ?? 'api',
      apiVersion: process.env.API_VERSION ?? '1',
      corsOrigins: toList(process.env.CORS_ORIGINS, '*'),
      logLevel: process.env.LOG_LEVEL ?? 'info',
      isProduction: env === Environment.Production,
      isDevelopment: env === Environment.Development,
    },
    database: {
      uri: process.env.MONGODB_URI as string,
      dbName: process.env.MONGODB_DB_NAME,
    },
    redis: {
      enabled: toBool(process.env.REDIS_ENABLED, false),
      host: process.env.REDIS_HOST ?? 'localhost',
      port: toInt(process.env.REDIS_PORT, 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: toInt(process.env.REDIS_DB, 0),
      keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'spendes:',
    },
    jwt: {
      access: {
        secret: process.env.JWT_ACCESS_SECRET as string,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      },
      refresh: {
        secret: process.env.JWT_REFRESH_SECRET as string,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
      },
    },
    security: {
      bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 10),
    },
    otp: {
      length: toInt(process.env.OTP_LENGTH, 6),
      ttlSeconds: toInt(process.env.OTP_TTL_SECONDS, 300),
      maxAttempts: toInt(process.env.OTP_MAX_ATTEMPTS, 5),
      resendCooldownSeconds: toInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 30),
      mockEnabled: toBool(process.env.OTP_MOCK_ENABLED, true),
      mockCode: process.env.OTP_MOCK_CODE ?? '123456',
    },
    sms: {
      provider: (process.env.SMS_PROVIDER ?? 'console') as SmsProviderName,
      from: process.env.SMS_FROM ?? 'Spendes',
    },
    phone: {
      defaultDialCode: process.env.PHONE_DEFAULT_DIAL_CODE ?? '+91',
      allowedDialCodes: toList(process.env.PHONE_ALLOWED_DIAL_CODES, '+91'),
    },
    throttle: {
      ttl: toInt(process.env.THROTTLE_TTL, 60),
      limit: toInt(process.env.THROTTLE_LIMIT, 100),
    },
    swagger: {
      enabled: toBool(process.env.SWAGGER_ENABLED, true),
      path: process.env.SWAGGER_PATH ?? 'docs',
    },
  };
};
