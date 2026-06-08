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
import {
  createExpenseSchema,
  expenseSummaryQuerySchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from '../modules/expenses/expenses.validation';
import {
  createIncomeSchema,
  incomeSummaryQuerySchema,
  listIncomeQuerySchema,
  updateIncomeSchema,
} from '../modules/income/income.validation';
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from '../modules/categories/categories.validation';
import { PaymentMethod } from '../common/enums/payment-method';
import { CategoryType } from '../common/enums/category-type';
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

const expenseResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    amount: z.number(),
    currency: z.string(),
    category: z.string(),
    description: z.string().optional(),
    merchant: z.string().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod),
    spentAt: z.string(),
    notes: z.string().optional(),
    tags: z.array(z.string()),
    receiptUrl: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ExpenseResponse');

const expenseSummarySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    totalAmount: z.number(),
    count: z.number(),
    byCategory: z.array(
      z.object({ category: z.string(), totalAmount: z.number(), count: z.number() }),
    ),
    byPaymentMethod: z.array(
      z.object({
        paymentMethod: z.nativeEnum(PaymentMethod),
        totalAmount: z.number(),
        count: z.number(),
      }),
    ),
  })
  .openapi('ExpenseSummary');

const incomeResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    amount: z.number(),
    currency: z.string(),
    category: z.string(),
    source: z.string().optional(),
    description: z.string().optional(),
    receivedVia: z.nativeEnum(PaymentMethod),
    receivedAt: z.string(),
    notes: z.string().optional(),
    tags: z.array(z.string()),
    isRecurring: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('IncomeResponse');

const incomeSummarySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    totalAmount: z.number(),
    count: z.number(),
    byCategory: z.array(
      z.object({ category: z.string(), totalAmount: z.number(), count: z.number() }),
    ),
    bySource: z.array(z.object({ source: z.string(), totalAmount: z.number(), count: z.number() })),
  })
  .openapi('IncomeSummary');

const categoryResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    type: z.nativeEnum(CategoryType),
    icon: z.string().optional(),
    color: z.string().optional(),
    iconUrl: z.string().optional(),
    description: z.string().optional(),
    isSystem: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('CategoryResponse');

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

  // --- Categories ---
  registry.registerPath({
    method: 'get',
    path: '/categories',
    summary: 'List categories (admins may include inactive)',
    tags: ['Categories'],
    security: bearer,
    request: { query: listCategoriesQuerySchema },
    responses: {
      200: {
        description: 'Categories',
        ...jsonContent(success(z.array(categoryResponseSchema))),
      },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/categories',
    summary: 'Create a category (admin only)',
    tags: ['Categories'],
    security: bearer,
    request: { body: jsonContent(createCategorySchema) },
    responses: {
      201: { description: 'Category created', ...jsonContent(success(categoryResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      403: { description: 'Forbidden', ...jsonContent(errorResponseSchema) },
      409: { description: 'Slug already exists', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/categories/{id}',
    summary: 'Get a category by id',
    tags: ['Categories'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Category', ...jsonContent(success(categoryResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/categories/{id}',
    summary: 'Update a category (admin only)',
    tags: ['Categories'],
    security: bearer,
    request: { params: idParamSchema, body: jsonContent(updateCategorySchema) },
    responses: {
      200: { description: 'Updated category', ...jsonContent(success(categoryResponseSchema)) },
      403: { description: 'Forbidden', ...jsonContent(errorResponseSchema) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/categories/{id}',
    summary: 'Delete a non-system category (admin only)',
    tags: ['Categories'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Deleted' },
      400: {
        description: 'System categories cannot be deleted',
        ...jsonContent(errorResponseSchema),
      },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- Expenses ---
  registry.registerPath({
    method: 'post',
    path: '/expenses',
    summary: 'Record a new expense',
    tags: ['Expenses'],
    security: bearer,
    request: { body: jsonContent(createExpenseSchema) },
    responses: {
      201: { description: 'Expense created', ...jsonContent(success(expenseResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/expenses',
    summary: "List the authenticated user's expenses (paginated, filterable)",
    tags: ['Expenses'],
    security: bearer,
    request: { query: listExpensesQuerySchema },
    responses: {
      200: {
        description: 'Paginated expenses',
        ...jsonContent(
          success(z.object({ items: z.array(expenseResponseSchema), meta: pageMetaSchema })),
        ),
      },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/expenses/summary',
    summary: 'Spend totals and breakdowns over an optional date window',
    tags: ['Expenses'],
    security: bearer,
    request: { query: expenseSummaryQuerySchema },
    responses: {
      200: { description: 'Expense summary', ...jsonContent(success(expenseSummarySchema)) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/expenses/{id}',
    summary: 'Get an expense by id',
    tags: ['Expenses'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Expense', ...jsonContent(success(expenseResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/expenses/{id}',
    summary: 'Update an expense by id',
    tags: ['Expenses'],
    security: bearer,
    request: { params: idParamSchema, body: jsonContent(updateExpenseSchema) },
    responses: {
      200: { description: 'Updated expense', ...jsonContent(success(expenseResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/expenses/{id}',
    summary: 'Delete an expense by id',
    tags: ['Expenses'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- Income ---
  registry.registerPath({
    method: 'post',
    path: '/income',
    summary: 'Record a new income entry',
    tags: ['Income'],
    security: bearer,
    request: { body: jsonContent(createIncomeSchema) },
    responses: {
      201: { description: 'Income created', ...jsonContent(success(incomeResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/income',
    summary: "List the authenticated user's income (paginated, filterable)",
    tags: ['Income'],
    security: bearer,
    request: { query: listIncomeQuerySchema },
    responses: {
      200: {
        description: 'Paginated income',
        ...jsonContent(
          success(z.object({ items: z.array(incomeResponseSchema), meta: pageMetaSchema })),
        ),
      },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/income/summary',
    summary: 'Income totals and breakdowns over an optional date window',
    tags: ['Income'],
    security: bearer,
    request: { query: incomeSummaryQuerySchema },
    responses: {
      200: { description: 'Income summary', ...jsonContent(success(incomeSummarySchema)) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/income/{id}',
    summary: 'Get an income entry by id',
    tags: ['Income'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Income', ...jsonContent(success(incomeResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/income/{id}',
    summary: 'Update an income entry by id',
    tags: ['Income'],
    security: bearer,
    request: { params: idParamSchema, body: jsonContent(updateIncomeSchema) },
    responses: {
      200: { description: 'Updated income', ...jsonContent(success(incomeResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/income/{id}',
    summary: 'Delete an income entry by id',
    tags: ['Income'],
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
