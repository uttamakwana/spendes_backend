import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { config } from '../config';
import { Role } from '../common/enums/role';
import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  requestOtpSchema,
} from '../modules/auth/auth.validation';
import { updateUserSchema } from '../modules/users/users.validation';
import { paginationQuerySchema } from '../common/utils/pagination';
import { idParamSchema } from '../common/utils/object-id';

// Teach Zod the `.openapi()` helper and let the generator introspect our schemas.
extendZodWithOpenApi(z);

// --- Response component schemas (documentation only) -------------------------

const userResponseSchema = z
  .object({
    id: z.string(),
    dialCode: z.string(),
    phoneNumber: z.string(),
    phoneE164: z.string(),
    email: z.string().optional(),
    firstName: z.string(),
    lastName: z.string(),
    fullName: z.string(),
    avatarUrl: z.string().optional(),
    roles: z.array(z.nativeEnum(Role)),
    defaultCurrency: z.string(),
    isPhoneVerified: z.boolean(),
    isEmailVerified: z.boolean(),
    isActive: z.boolean(),
    lastLoginAt: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('UserResponse');

const authTokensSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number(),
  })
  .openapi('AuthTokens');

const authResponseSchema = z
  .object({ user: userResponseSchema, tokens: authTokensSchema })
  .openapi('AuthResponse');

const otpRequestResponseSchema = z
  .object({
    isRegistered: z.boolean(),
    expiresInSeconds: z.number(),
    mocked: z.boolean(),
  })
  .openapi('OtpRequestResponse');

const pageMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
  hasPreviousPage: z.boolean(),
  hasNextPage: z.boolean(),
});

/** Wraps a data schema in the standard success envelope. */
const success = (dataSchema: z.ZodTypeAny) =>
  z.object({
    success: z.literal(true),
    statusCode: z.number(),
    message: z.string(),
    data: dataSchema,
    timestamp: z.string(),
    path: z.string(),
    requestId: z.string().optional(),
  });

const errorResponseSchema = z
  .object({
    success: z.literal(false),
    statusCode: z.number(),
    message: z.string(),
    errorCode: z.string().optional(),
    errors: z.unknown().optional(),
    timestamp: z.string(),
    path: z.string(),
    requestId: z.string().optional(),
  })
  .openapi('ErrorResponse');

const jsonContent = (schema: z.ZodTypeAny) => ({
  content: { 'application/json': { schema } },
});

/**
 * Builds the OpenAPI 3.0 document from the application's Zod schemas — a single
 * source of truth for validation and docs. Served via `swagger-ui-express`.
 */
export function buildOpenApiDocument(): ReturnType<OpenApiGeneratorV3['generateDocument']> {
  const registry = new OpenAPIRegistry();

  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  const bearer = [{ bearerAuth: [] as string[] }];

  // --- Auth ---
  registry.registerPath({
    method: 'post',
    path: '/auth/otp/request',
    summary: 'Send a one-time login/registration code to a phone number',
    tags: ['Auth'],
    request: { body: jsonContent(requestOtpSchema) },
    responses: {
      200: {
        description: 'Verification code sent',
        ...jsonContent(success(otpRequestResponseSchema)),
      },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      429: { description: 'Too many requests', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/register',
    summary: 'Verify the OTP and create a new account',
    tags: ['Auth'],
    request: { body: jsonContent(registerSchema) },
    responses: {
      201: { description: 'Registration successful', ...jsonContent(success(authResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      409: { description: 'Phone already registered', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    summary: 'Verify the OTP for an existing account and receive tokens',
    tags: ['Auth'],
    request: { body: jsonContent(loginSchema) },
    responses: {
      200: { description: 'Login successful', ...jsonContent(success(authResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      404: { description: 'No account for this number', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/refresh',
    summary: 'Exchange a refresh token for a new token pair',
    tags: ['Auth'],
    request: { body: jsonContent(refreshTokenSchema) },
    responses: {
      200: { description: 'Token refreshed', ...jsonContent(success(authTokensSchema)) },
      401: { description: 'Invalid refresh token', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/logout',
    summary: 'Revoke the refresh token for the current session',
    tags: ['Auth'],
    security: bearer,
    responses: {
      200: {
        description: 'Logged out',
        ...jsonContent(success(z.object({ revoked: z.boolean() }))),
      },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- Users ---
  registry.registerPath({
    method: 'get',
    path: '/users/me',
    summary: 'Get the authenticated user profile',
    tags: ['Users'],
    security: bearer,
    responses: {
      200: { description: 'Profile', ...jsonContent(success(userResponseSchema)) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/users/me',
    summary: 'Update the authenticated user profile',
    tags: ['Users'],
    security: bearer,
    request: { body: jsonContent(updateUserSchema) },
    responses: {
      200: { description: 'Updated profile', ...jsonContent(success(userResponseSchema)) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users',
    summary: 'List users (admin only)',
    tags: ['Users'],
    security: bearer,
    request: { query: paginationQuerySchema },
    responses: {
      200: {
        description: 'Paginated users',
        ...jsonContent(
          success(z.object({ items: z.array(userResponseSchema), meta: pageMetaSchema })),
        ),
      },
      403: { description: 'Forbidden', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users/{id}',
    summary: 'Get a user by id (admin only)',
    tags: ['Users'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      200: { description: 'User', ...jsonContent(success(userResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/users/{id}',
    summary: 'Delete a user by id (admin only)',
    tags: ['Users'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- Health ---
  registry.registerPath({
    method: 'get',
    path: '/health',
    summary: 'Liveness/readiness probe',
    tags: ['Health'],
    responses: {
      200: {
        description: 'Service is healthy',
        ...jsonContent(success(z.object({ status: z.string() }))),
      },
      503: { description: 'Service is unhealthy', ...jsonContent(errorResponseSchema) },
    },
  });

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Spendes API',
      version: config.app.apiVersion,
      description: 'Expense tracking, splitting, budgeting & financial analysis API',
    },
    servers: [{ url: `/${config.app.apiPrefix}/v${config.app.apiVersion}` }],
  });
}
