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
  throttle: ThrottleConfig;
  swagger: SwaggerConfig;
}
