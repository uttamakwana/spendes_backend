import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { config } from '../config';
import { Role } from '../common/enums/role';
import { PlanType } from '../common/enums/plan-type';
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
import {
  createGroupSchema,
  listGroupsQuerySchema,
  memberInviteSchema,
  memberParamsSchema,
  updateGroupSchema,
  updateMemberSchema,
} from '../modules/groups/groups.validation';
import { GroupKind, GroupMemberStatus, GroupRole } from '../modules/groups/groups.enums';
import { addFriendSchema, friendParamsSchema } from '../modules/friends/friends.validation';
import {
  createGroupExpenseSchema,
  createSettlementSchema,
  expenseParamsSchema,
  groupScopeParamsSchema,
  listGroupItemsQuerySchema,
  settlementIntentSchema,
  updateGroupExpenseSchema,
} from '../modules/splits/splits.validation';
import { SplitStrategy } from '../modules/splits/splits.enums';
import {
  createBudgetSchema,
  listBudgetsQuerySchema,
  updateBudgetSchema,
} from '../modules/budgets/budgets.validation';
import { BudgetPeriod } from '../common/enums/budget-period';
import {
  createEmiSchema,
  listEmisQuerySchema,
  updateEmiSchema,
} from '../modules/emis/emis.validation';
import { EmiFrequency, EmiType } from '../modules/emis/emis.enums';
import {
  contributeGoalSchema,
  createGoalSchema,
  listGoalsQuerySchema,
  updateGoalSchema,
} from '../modules/goals/goals.validation';
import {
  createInvestmentSchema,
  listInvestmentsQuerySchema,
  updateInvestmentSchema,
} from '../modules/investments/investments.validation';
import { InvestmentType } from '../modules/investments/investments.enums';
import { cashflowQuerySchema } from '../modules/analytics/analytics.validation';
import { PaymentMethod } from '../common/enums/payment-method';
import { ExpenseSource } from '../common/enums/expense-source';
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
    plan: z.nativeEnum(PlanType),
    upiId: z.string().optional(),
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
    source: z.nativeEnum(ExpenseSource),
    groupId: z.string().optional(),
    groupExpenseId: z.string().optional(),
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

const groupMemberResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string().optional(),
    displayName: z.string(),
    role: z.nativeEnum(GroupRole),
    status: z.nativeEnum(GroupMemberStatus),
    dialCode: z.string().optional(),
    phoneNumber: z.string().optional(),
    isYou: z.boolean(),
    isRegistered: z.boolean(),
    joinedAt: z.string(),
  })
  .openapi('GroupMemberResponse');

const groupResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    avatarUrl: z.string().optional(),
    currency: z.string(),
    kind: z.nativeEnum(GroupKind),
    createdBy: z.string(),
    members: z.array(groupMemberResponseSchema),
    memberCount: z.number(),
    myRole: z.nativeEnum(GroupRole).optional(),
    isActive: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('GroupResponse');

const groupExpenseResponseSchema = z
  .object({
    id: z.string(),
    groupId: z.string(),
    description: z.string(),
    amount: z.number(),
    currency: z.string(),
    category: z.string().optional(),
    paidBy: z.array(z.object({ memberId: z.string(), amount: z.number() })),
    splitStrategy: z.nativeEnum(SplitStrategy),
    splits: z.array(
      z.object({
        memberId: z.string(),
        amount: z.number(),
        percentage: z.number().optional(),
        shares: z.number().optional(),
      }),
    ),
    spentAt: z.string(),
    notes: z.string().optional(),
    createdByMemberId: z.string(),
    createdByUserId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('GroupExpenseResponse');

const settlementResponseSchema = z
  .object({
    id: z.string(),
    groupId: z.string(),
    fromMemberId: z.string(),
    toMemberId: z.string(),
    amount: z.number(),
    currency: z.string(),
    method: z.nativeEnum(PaymentMethod),
    note: z.string().optional(),
    settledAt: z.string(),
    createdByUserId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('SettlementResponse');

const groupBalancesResponseSchema = z
  .object({
    groupId: z.string(),
    currency: z.string(),
    balances: z.array(z.object({ memberId: z.string(), displayName: z.string(), net: z.number() })),
    suggestedTransfers: z.array(
      z.object({
        fromMemberId: z.string(),
        fromName: z.string(),
        toMemberId: z.string(),
        toName: z.string(),
        amount: z.number(),
      }),
    ),
    myMemberId: z.string().optional(),
    myNet: z.number().optional(),
  })
  .openapi('GroupBalancesResponse');

const settlementIntentResponseSchema = z
  .object({
    provider: z.string(),
    uri: z.string(),
    toMemberId: z.string(),
    payeeName: z.string(),
    payeeVpa: z.string(),
    amount: z.number(),
    currency: z.string(),
    note: z.string().optional(),
  })
  .openapi('SettlementIntentResponse');

const friendResponseSchema = z
  .object({
    friendshipId: z.string(),
    myMemberId: z.string(),
    friendMemberId: z.string(),
    displayName: z.string(),
    userId: z.string().optional(),
    isRegistered: z.boolean(),
    dialCode: z.string().optional(),
    phoneNumber: z.string().optional(),
    currency: z.string(),
    net: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('FriendResponse');

const friendsListResponseSchema = z
  .object({
    friends: z.array(friendResponseSchema),
    totalYouAreOwed: z.number(),
    totalYouOwe: z.number(),
    net: z.number(),
  })
  .openapi('FriendsListResponse');

const budgetResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string().optional(),
    category: z.string().optional(),
    amount: z.number(),
    currency: z.string(),
    period: z.nativeEnum(BudgetPeriod),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    alertThresholdPct: z.number(),
    isActive: z.boolean(),
    periodStart: z.string(),
    periodEnd: z.string(),
    spent: z.number(),
    remaining: z.number(),
    percentUsed: z.number(),
    status: z.enum(['ok', 'warning', 'exceeded']),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('BudgetResponse');

const emiResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    type: z.nativeEnum(EmiType),
    amount: z.number(),
    currency: z.string(),
    frequency: z.nativeEnum(EmiFrequency),
    startDate: z.string(),
    category: z.string().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    interestRatePct: z.number().optional(),
    principal: z.number().optional(),
    tenureCount: z.number().optional(),
    autoDebit: z.boolean(),
    isActive: z.boolean(),
    notes: z.string().optional(),
    nextDueDate: z.string().optional(),
    installmentsPaid: z.number(),
    installmentsRemaining: z.number().optional(),
    remainingAmount: z.number().optional(),
    endDate: z.string().optional(),
    isCompleted: z.boolean(),
    monthlyEquivalent: z.number(),
    dueThisMonth: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('EmiResponse');

const emiSummarySchema = z
  .object({
    activeCount: z.number(),
    totalMonthlyCommitment: z.number(),
    totalOutstanding: z.number(),
    dueThisMonth: z.object({ count: z.number(), total: z.number() }),
    byType: z.array(
      z.object({
        type: z.nativeEnum(EmiType),
        count: z.number(),
        monthlyTotal: z.number(),
      }),
    ),
  })
  .openapi('EmiSummary');

const goalResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    targetAmount: z.number(),
    currentAmount: z.number(),
    currency: z.string(),
    targetDate: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    notes: z.string().optional(),
    progressPct: z.number(),
    remainingAmount: z.number(),
    isAchieved: z.boolean(),
    daysRemaining: z.number().optional(),
    monthsRemaining: z.number().optional(),
    requiredMonthlySaving: z.number().optional(),
    contributions: z.array(
      z.object({
        id: z.string(),
        amount: z.number(),
        note: z.string().optional(),
        contributedAt: z.string(),
      }),
    ),
    isActive: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('GoalResponse');

const investmentResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    type: z.nativeEnum(InvestmentType),
    investedAmount: z.number(),
    currentValue: z.number(),
    currency: z.string(),
    quantity: z.number().optional(),
    platform: z.string().optional(),
    notes: z.string().optional(),
    gainLoss: z.number(),
    gainLossPct: z.number(),
    isActive: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('InvestmentResponse');

const investmentSummarySchema = z
  .object({
    holdingsCount: z.number(),
    totalInvested: z.number(),
    totalCurrentValue: z.number(),
    totalGainLoss: z.number(),
    gainLossPct: z.number(),
    allocation: z.array(
      z.object({
        type: z.nativeEnum(InvestmentType),
        currentValue: z.number(),
        investedAmount: z.number(),
        percent: z.number(),
      }),
    ),
  })
  .openapi('InvestmentSummary');

const analyticsOverviewSchema = z
  .object({
    period: z.object({ from: z.string(), to: z.string() }),
    income: z.number(),
    expense: z.number(),
    net: z.number(),
    savingsRate: z.number(),
    topCategories: z.array(z.object({ category: z.string(), totalAmount: z.number() })),
    commitments: z.object({
      totalMonthlyCommitment: z.number(),
      dueThisMonthCount: z.number(),
      dueThisMonthTotal: z.number(),
    }),
    portfolio: z.object({
      totalInvested: z.number(),
      totalCurrentValue: z.number(),
      totalGainLoss: z.number(),
      gainLossPct: z.number(),
    }),
    netWorth: z.object({ assets: z.number(), liabilities: z.number(), net: z.number() }),
  })
  .openapi('AnalyticsOverview');

const cashflowResponseSchema = z
  .object({
    months: z.number(),
    from: z.string(),
    to: z.string(),
    series: z.array(
      z.object({
        year: z.number(),
        month: z.number(),
        label: z.string(),
        income: z.number(),
        expense: z.number(),
        net: z.number(),
      }),
    ),
    totalIncome: z.number(),
    totalExpense: z.number(),
    net: z.number(),
  })
  .openapi('CashflowResponse');

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

  // --- Groups ---
  registry.registerPath({
    method: 'post',
    path: '/groups',
    summary: 'Create a group (caller becomes its first admin)',
    tags: ['Groups'],
    security: bearer,
    request: { body: jsonContent(createGroupSchema) },
    responses: {
      201: { description: 'Group created', ...jsonContent(success(groupResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/groups',
    summary: 'List the groups the caller belongs to (paginated)',
    tags: ['Groups'],
    security: bearer,
    request: { query: listGroupsQuerySchema },
    responses: {
      200: {
        description: 'Paginated groups',
        ...jsonContent(
          success(z.object({ items: z.array(groupResponseSchema), meta: pageMetaSchema })),
        ),
      },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/groups/{id}',
    summary: 'Get a group by id (members only)',
    tags: ['Groups'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Group', ...jsonContent(success(groupResponseSchema)) },
      404: { description: 'Not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/groups/{id}',
    summary: 'Update group details (admin only)',
    tags: ['Groups'],
    security: bearer,
    request: { params: idParamSchema, body: jsonContent(updateGroupSchema) },
    responses: {
      200: { description: 'Updated group', ...jsonContent(success(groupResponseSchema)) },
      403: { description: 'Not a group admin', ...jsonContent(errorResponseSchema) },
      404: { description: 'Not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/groups/{id}',
    summary: 'Archive a group (admin only)',
    tags: ['Groups'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Archived' },
      403: { description: 'Not a group admin', ...jsonContent(errorResponseSchema) },
      404: { description: 'Not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/groups/{id}/members',
    summary: 'Add a member by userId or phone (admin only); unknown phones become invites',
    tags: ['Groups'],
    security: bearer,
    request: { params: idParamSchema, body: jsonContent(memberInviteSchema) },
    responses: {
      201: { description: 'Member added', ...jsonContent(success(groupResponseSchema)) },
      403: { description: 'Not a group admin', ...jsonContent(errorResponseSchema) },
      404: { description: 'Group or user not found', ...jsonContent(errorResponseSchema) },
      409: { description: 'Already a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/groups/{id}/members/{memberId}',
    summary: "Change a member's role (admin only)",
    tags: ['Groups'],
    security: bearer,
    request: { params: memberParamsSchema, body: jsonContent(updateMemberSchema) },
    responses: {
      200: { description: 'Member updated', ...jsonContent(success(groupResponseSchema)) },
      400: {
        description: 'Would leave the group without an admin',
        ...jsonContent(errorResponseSchema),
      },
      403: { description: 'Not a group admin', ...jsonContent(errorResponseSchema) },
      404: { description: 'Group or member not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/groups/{id}/members/{memberId}',
    summary: 'Remove a member (admin), or leave the group (self)',
    tags: ['Groups'],
    security: bearer,
    request: { params: memberParamsSchema },
    responses: {
      200: { description: 'Member removed', ...jsonContent(success(groupResponseSchema)) },
      400: {
        description: 'Would leave the group without an admin',
        ...jsonContent(errorResponseSchema),
      },
      403: {
        description: 'Not allowed to remove this member',
        ...jsonContent(errorResponseSchema),
      },
      404: { description: 'Group or member not found', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- Splits (group expenses, balances, settlements) ---
  registry.registerPath({
    method: 'post',
    path: '/groups/{groupId}/expenses',
    summary: 'Log a shared expense and how it splits among members',
    tags: ['Splits'],
    security: bearer,
    request: { params: groupScopeParamsSchema, body: jsonContent(createGroupExpenseSchema) },
    responses: {
      201: {
        description: 'Group expense created',
        ...jsonContent(success(groupExpenseResponseSchema)),
      },
      400: {
        description: 'Validation failed or member not in group',
        ...jsonContent(errorResponseSchema),
      },
      404: { description: 'Group not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/groups/{groupId}/expenses',
    summary: "List a group's shared expenses (paginated)",
    tags: ['Splits'],
    security: bearer,
    request: { params: groupScopeParamsSchema, query: listGroupItemsQuerySchema },
    responses: {
      200: {
        description: 'Paginated group expenses',
        ...jsonContent(
          success(z.object({ items: z.array(groupExpenseResponseSchema), meta: pageMetaSchema })),
        ),
      },
      404: { description: 'Group not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/groups/{groupId}/expenses/{expenseId}',
    summary: 'Get a single shared expense',
    tags: ['Splits'],
    security: bearer,
    request: { params: expenseParamsSchema },
    responses: {
      200: { description: 'Group expense', ...jsonContent(success(groupExpenseResponseSchema)) },
      404: { description: 'Not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/groups/{groupId}/expenses/{expenseId}',
    summary: 'Edit expense metadata (creator or group admin)',
    tags: ['Splits'],
    security: bearer,
    request: { params: expenseParamsSchema, body: jsonContent(updateGroupExpenseSchema) },
    responses: {
      200: { description: 'Updated expense', ...jsonContent(success(groupExpenseResponseSchema)) },
      403: { description: 'Not the creator or an admin', ...jsonContent(errorResponseSchema) },
      404: { description: 'Not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/groups/{groupId}/expenses/{expenseId}',
    summary: 'Delete a shared expense (creator or group admin)',
    tags: ['Splits'],
    security: bearer,
    request: { params: expenseParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      403: { description: 'Not the creator or an admin', ...jsonContent(errorResponseSchema) },
      404: { description: 'Not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/groups/{groupId}/balances',
    summary: 'Net balances and suggested "who pays whom" transfers',
    tags: ['Splits'],
    security: bearer,
    request: { params: groupScopeParamsSchema },
    responses: {
      200: { description: 'Group balances', ...jsonContent(success(groupBalancesResponseSchema)) },
      404: { description: 'Group not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/groups/{groupId}/settlements',
    summary: 'Record a payment between two members (mark as paid)',
    tags: ['Splits'],
    security: bearer,
    request: { params: groupScopeParamsSchema, body: jsonContent(createSettlementSchema) },
    responses: {
      201: {
        description: 'Settlement recorded',
        ...jsonContent(success(settlementResponseSchema)),
      },
      400: { description: 'Invalid members', ...jsonContent(errorResponseSchema) },
      404: { description: 'Group not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/groups/{groupId}/settlements',
    summary: 'List recorded settlements (paginated)',
    tags: ['Splits'],
    security: bearer,
    request: { params: groupScopeParamsSchema, query: listGroupItemsQuerySchema },
    responses: {
      200: {
        description: 'Paginated settlements',
        ...jsonContent(
          success(z.object({ items: z.array(settlementResponseSchema), meta: pageMetaSchema })),
        ),
      },
      404: { description: 'Group not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/groups/{groupId}/settlements/intent',
    summary: 'Build a UPI deep link to pay a member (requires their UPI id)',
    tags: ['Splits'],
    security: bearer,
    request: { params: groupScopeParamsSchema, body: jsonContent(settlementIntentSchema) },
    responses: {
      200: {
        description: 'UPI payment intent',
        ...jsonContent(success(settlementIntentResponseSchema)),
      },
      400: { description: 'Member has no UPI id on file', ...jsonContent(errorResponseSchema) },
      404: { description: 'Group not found or not a member', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- Friends (1-on-1 direct splits) ---
  registry.registerPath({
    method: 'post',
    path: '/friends',
    summary: 'Add a friend by userId or phone (reuses an existing friendship)',
    tags: ['Friends'],
    security: bearer,
    request: { body: jsonContent(addFriendSchema) },
    responses: {
      201: { description: 'Friend added', ...jsonContent(success(friendResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/friends',
    summary: 'List friends with per-friend balances and owed/owe totals',
    tags: ['Friends'],
    security: bearer,
    responses: {
      200: { description: 'Friends', ...jsonContent(success(friendsListResponseSchema)) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/friends/{friendshipId}',
    summary: 'Get a friend with your net balance',
    tags: ['Friends'],
    security: bearer,
    request: { params: friendParamsSchema },
    responses: {
      200: { description: 'Friend', ...jsonContent(success(friendResponseSchema)) },
      404: { description: 'Friend not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/friends/{friendshipId}/expenses',
    summary: 'Log a direct (1-on-1) split expense with a friend',
    tags: ['Friends'],
    security: bearer,
    request: { params: friendParamsSchema, body: jsonContent(createGroupExpenseSchema) },
    responses: {
      201: { description: 'Expense created', ...jsonContent(success(groupExpenseResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      404: { description: 'Friend not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/friends/{friendshipId}/expenses',
    summary: 'List direct expenses with a friend (paginated)',
    tags: ['Friends'],
    security: bearer,
    request: { params: friendParamsSchema, query: listGroupItemsQuerySchema },
    responses: {
      200: {
        description: 'Paginated direct expenses',
        ...jsonContent(
          success(z.object({ items: z.array(groupExpenseResponseSchema), meta: pageMetaSchema })),
        ),
      },
      404: { description: 'Friend not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/friends/{friendshipId}/settlements',
    summary: 'Record a payment with a friend (mark as paid)',
    tags: ['Friends'],
    security: bearer,
    request: { params: friendParamsSchema, body: jsonContent(createSettlementSchema) },
    responses: {
      201: {
        description: 'Settlement recorded',
        ...jsonContent(success(settlementResponseSchema)),
      },
      400: { description: 'Invalid members', ...jsonContent(errorResponseSchema) },
      404: { description: 'Friend not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/friends/{friendshipId}/settlements/intent',
    summary: 'Build a UPI deep link to pay a friend',
    tags: ['Friends'],
    security: bearer,
    request: { params: friendParamsSchema, body: jsonContent(settlementIntentSchema) },
    responses: {
      200: {
        description: 'UPI payment intent',
        ...jsonContent(success(settlementIntentResponseSchema)),
      },
      400: { description: 'Friend has no UPI id on file', ...jsonContent(errorResponseSchema) },
      404: { description: 'Friend not found', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- Budgets ---
  registry.registerPath({
    method: 'post',
    path: '/budgets',
    summary: 'Create a spending limit (overall or per-category)',
    tags: ['Budgets'],
    security: bearer,
    request: { body: jsonContent(createBudgetSchema) },
    responses: {
      201: { description: 'Budget created', ...jsonContent(success(budgetResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/budgets',
    summary: 'List budgets with live spent/remaining for the active period',
    tags: ['Budgets'],
    security: bearer,
    request: { query: listBudgetsQuerySchema },
    responses: {
      200: {
        description: 'Paginated budgets',
        ...jsonContent(
          success(z.object({ items: z.array(budgetResponseSchema), meta: pageMetaSchema })),
        ),
      },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/budgets/{id}',
    summary: 'Get a budget with its live computed view',
    tags: ['Budgets'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Budget', ...jsonContent(success(budgetResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/budgets/{id}',
    summary: 'Update a budget',
    tags: ['Budgets'],
    security: bearer,
    request: { params: idParamSchema, body: jsonContent(updateBudgetSchema) },
    responses: {
      200: { description: 'Updated budget', ...jsonContent(success(budgetResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/budgets/{id}',
    summary: 'Delete a budget',
    tags: ['Budgets'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- EMIs ---
  registry.registerPath({
    method: 'post',
    path: '/emis',
    summary: 'Track a recurring obligation (loan EMI, subscription, rent, …)',
    tags: ['EMIs'],
    security: bearer,
    request: { body: jsonContent(createEmiSchema) },
    responses: {
      201: { description: 'EMI created', ...jsonContent(success(emiResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/emis',
    summary: "List the user's obligations with their live schedule (paginated)",
    tags: ['EMIs'],
    security: bearer,
    request: { query: listEmisQuerySchema },
    responses: {
      200: {
        description: 'Paginated EMIs',
        ...jsonContent(
          success(z.object({ items: z.array(emiResponseSchema), meta: pageMetaSchema })),
        ),
      },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/emis/summary',
    summary: 'Total monthly commitment, due-this-month, and per-type breakdown',
    tags: ['EMIs'],
    security: bearer,
    responses: {
      200: { description: 'EMI summary', ...jsonContent(success(emiSummarySchema)) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/emis/{id}',
    summary: 'Get an obligation with its live schedule',
    tags: ['EMIs'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      200: { description: 'EMI', ...jsonContent(success(emiResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/emis/{id}',
    summary: 'Update an obligation',
    tags: ['EMIs'],
    security: bearer,
    request: { params: idParamSchema, body: jsonContent(updateEmiSchema) },
    responses: {
      200: { description: 'Updated EMI', ...jsonContent(success(emiResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/emis/{id}',
    summary: 'Delete an obligation',
    tags: ['EMIs'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- Goals ---
  registry.registerPath({
    method: 'post',
    path: '/goals',
    summary: 'Create a savings goal',
    tags: ['Goals'],
    security: bearer,
    request: { body: jsonContent(createGoalSchema) },
    responses: {
      201: { description: 'Goal created', ...jsonContent(success(goalResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/goals',
    summary: "List the user's goals with live progress (paginated)",
    tags: ['Goals'],
    security: bearer,
    request: { query: listGoalsQuerySchema },
    responses: {
      200: {
        description: 'Paginated goals',
        ...jsonContent(
          success(z.object({ items: z.array(goalResponseSchema), meta: pageMetaSchema })),
        ),
      },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/goals/{id}',
    summary: 'Get a goal with its progress',
    tags: ['Goals'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Goal', ...jsonContent(success(goalResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/goals/{id}',
    summary: 'Update a goal',
    tags: ['Goals'],
    security: bearer,
    request: { params: idParamSchema, body: jsonContent(updateGoalSchema) },
    responses: {
      200: { description: 'Updated goal', ...jsonContent(success(goalResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/goals/{id}',
    summary: 'Delete a goal',
    tags: ['Goals'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/goals/{id}/contribute',
    summary: 'Add a deposit toward a goal',
    tags: ['Goals'],
    security: bearer,
    request: { params: idParamSchema, body: jsonContent(contributeGoalSchema) },
    responses: {
      201: { description: 'Contribution added', ...jsonContent(success(goalResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- Investments ---
  registry.registerPath({
    method: 'post',
    path: '/investments',
    summary: 'Add a holding to the portfolio',
    tags: ['Investments'],
    security: bearer,
    request: { body: jsonContent(createInvestmentSchema) },
    responses: {
      201: { description: 'Investment created', ...jsonContent(success(investmentResponseSchema)) },
      400: { description: 'Validation failed', ...jsonContent(errorResponseSchema) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/investments',
    summary: 'List holdings with gain/loss (paginated)',
    tags: ['Investments'],
    security: bearer,
    request: { query: listInvestmentsQuerySchema },
    responses: {
      200: {
        description: 'Paginated investments',
        ...jsonContent(
          success(z.object({ items: z.array(investmentResponseSchema), meta: pageMetaSchema })),
        ),
      },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/investments/summary',
    summary: 'Portfolio totals, gain/loss, and allocation by asset class',
    tags: ['Investments'],
    security: bearer,
    responses: {
      200: { description: 'Portfolio summary', ...jsonContent(success(investmentSummarySchema)) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/investments/{id}',
    summary: 'Get a holding with its gain/loss',
    tags: ['Investments'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Investment', ...jsonContent(success(investmentResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/investments/{id}',
    summary: 'Update a holding (typically its current value)',
    tags: ['Investments'],
    security: bearer,
    request: { params: idParamSchema, body: jsonContent(updateInvestmentSchema) },
    responses: {
      200: { description: 'Updated investment', ...jsonContent(success(investmentResponseSchema)) },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/investments/{id}',
    summary: 'Remove a holding',
    tags: ['Investments'],
    security: bearer,
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', ...jsonContent(errorResponseSchema) },
    },
  });

  // --- Analytics ---
  registry.registerPath({
    method: 'get',
    path: '/analytics/overview',
    summary: "This month's income/expense/savings snapshot, commitments, portfolio & net worth",
    tags: ['Analytics'],
    security: bearer,
    responses: {
      200: { description: 'Overview', ...jsonContent(success(analyticsOverviewSchema)) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/analytics/cashflow',
    summary: 'Income vs expense across the trailing months',
    tags: ['Analytics'],
    security: bearer,
    request: { query: cashflowQuerySchema },
    responses: {
      200: { description: 'Cash-flow trend', ...jsonContent(success(cashflowResponseSchema)) },
      401: { description: 'Unauthorized', ...jsonContent(errorResponseSchema) },
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
