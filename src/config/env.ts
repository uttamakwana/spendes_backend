import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Load environment files before anything reads `process.env`. `.env.local` is
// loaded first and wins, mirroring the previous `envFilePath: ['.env.local', '.env']`
// (dotenv never overrides an already-set variable).
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/** Supported runtime environments. */
export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

/** SMS gateways the app knows how to wire (only `console` is implemented today). */
export enum SmsProviderName {
  Console = 'console',
  Twilio = 'twilio',
  Msg91 = 'msg91',
}

/**
 * Parses common truthy string representations into a real boolean. Needed because
 * everything coming from `process.env` is a string.
 */
const booleanFromString = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') {
        return fallback;
      }
      return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

/** Parses an integer env var, applying a fallback when missing/blank. */
const intFromString = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number.parseInt(value ?? '', 10);
      return Number.isNaN(parsed) ? fallback : parsed;
    });

/**
 * The full, validated set of environment variables the application relies on.
 * Validation runs once at startup; if anything required is missing or malformed
 * the process refuses to boot (fail-fast) with a descriptive error.
 */
const envSchema = z.object({
  // --- Application ---
  NODE_ENV: z.nativeEnum(Environment).default(Environment.Development),
  PORT: intFromString(3000).pipe(z.number().int().min(0).max(65535)),
  APP_NAME: z.string().default('Spendes API'),
  API_PREFIX: z.string().default('api'),
  API_VERSION: z.string().default('1'),
  CORS_ORIGINS: z.string().default('*'),
  LOG_LEVEL: z.string().default('info'),

  // --- MongoDB ---
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().optional(),

  // --- Redis (optional infrastructure, gated by REDIS_ENABLED) ---
  REDIS_ENABLED: booleanFromString(false),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: intFromString(6379).pipe(z.number().int().min(0).max(65535)),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: intFromString(0).pipe(z.number().int().min(0)),
  REDIS_KEY_PREFIX: z.string().default('spendes:'),

  // --- JWT ---
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // --- Security ---
  BCRYPT_SALT_ROUNDS: intFromString(10).pipe(z.number().int().min(8).max(15)),

  // --- OTP / phone verification ---
  OTP_LENGTH: intFromString(6).pipe(z.number().int().min(4).max(8)),
  OTP_TTL_SECONDS: intFromString(300).pipe(z.number().int().min(30)),
  OTP_MAX_ATTEMPTS: intFromString(5).pipe(z.number().int().min(1)),
  OTP_RESEND_COOLDOWN_SECONDS: intFromString(30).pipe(z.number().int().min(0)),
  OTP_MOCK_ENABLED: booleanFromString(true),
  OTP_MOCK_CODE: z.string().default('123456'),

  // --- SMS gateway ---
  SMS_PROVIDER: z.nativeEnum(SmsProviderName).default(SmsProviderName.Console),
  SMS_FROM: z.string().default('Spendes'),

  // --- Phone numbering ---
  PHONE_DEFAULT_DIAL_CODE: z.string().default('+91'),
  PHONE_ALLOWED_DIAL_CODES: z.string().default('+91'),

  // --- Rate limiting ---
  THROTTLE_TTL: intFromString(60).pipe(z.number().int().min(1)),
  THROTTLE_LIMIT: intFromString(100).pipe(z.number().int().min(1)),

  // --- API docs ---
  SWAGGER_ENABLED: booleanFromString(true),
  SWAGGER_PATH: z.string().default('docs'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates `process.env` against {@link envSchema}. Throws a descriptive error
 * (aborting startup) when the environment is invalid.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  - ');
    throw new Error(`❌ Invalid environment configuration:\n  - ${details}`);
  }

  return result.data;
}

/** The validated environment, parsed once at import time. */
export const env: Env = parseEnv();
