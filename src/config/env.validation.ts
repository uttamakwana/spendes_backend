import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
  IsBoolean,
} from 'class-validator';

/**
 * Supported runtime environments.
 */
export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

/**
 * Parses common truthy string representations into a real boolean.
 * Needed because everything coming from `process.env` is a string.
 */
const toBoolean = ({ value }: { value: unknown }): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return false;
};

/**
 * The full, validated set of environment variables the application relies on.
 * Any variable added here is guaranteed to be present and well-typed at runtime,
 * otherwise the application refuses to boot (fail-fast).
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  APP_NAME: string = 'Spendes API';

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api';

  @IsString()
  @IsOptional()
  API_VERSION: string = '1';

  @IsString()
  @IsOptional()
  CORS_ORIGINS: string = '*';

  @IsString()
  @IsOptional()
  LOG_LEVEL: string = 'info';

  // --- MongoDB ---
  @IsString()
  @IsNotEmpty()
  MONGODB_URI!: string;

  @IsString()
  @IsOptional()
  MONGODB_DB_NAME?: string;

  // --- Redis (optional infrastructure, gated by REDIS_ENABLED) ---
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  REDIS_ENABLED: boolean = false;

  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  REDIS_DB: number = 0;

  @IsString()
  @IsOptional()
  REDIS_KEY_PREFIX: string = 'spendes:';

  // --- JWT ---
  @IsString()
  @MinLength(16)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @MinLength(16)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  // --- Security ---
  @Type(() => Number)
  @IsInt()
  @Min(8)
  @Max(15)
  @IsOptional()
  BCRYPT_SALT_ROUNDS: number = 10;

  // --- Rate limiting ---
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_TTL: number = 60;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_LIMIT: number = 100;

  // --- API docs ---
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  SWAGGER_ENABLED: boolean = true;

  @IsString()
  @IsOptional()
  SWAGGER_PATH: string = 'docs';
}

/**
 * Validation function plugged into `ConfigModule.forRoot({ validate })`.
 * Throws a descriptive error (aborting startup) when the environment is invalid.
 */
export function validate(config: Record<string, unknown>): EnvironmentVariables {
  // NOTE: implicit conversion is intentionally OFF. It coerces booleans via
  // `Boolean('false') === true`, which would corrupt flags like REDIS_ENABLED.
  // Numbers are converted explicitly with @Type, booleans with @Transform.
  const validatedConfig = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`❌ Invalid environment configuration:\n  - ${details}`);
  }

  return validatedConfig;
}
