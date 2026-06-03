# Spendes — Backend API

Production-grade [NestJS](https://nestjs.com/) backend for **Spendes**, a personal-finance
platform for tracking and **splitting** expenses, budgeting, setting goals, and
analysing income vs. spending so users can plan each month with confidence.

Built with **NestJS 11 · MongoDB (Mongoose) · Redis-ready · JWT auth · Swagger · Pino**.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Conventions & patterns](#conventions--patterns)
- [API response shape](#api-response-shape)
- [Adding a new feature module](#adding-a-new-feature-module)
- [Domain roadmap](#domain-roadmap)

---

## Tech stack

| Concern             | Choice                                                        |
| ------------------- | ------------------------------------------------------------- |
| Framework           | NestJS 11 (Express)                                           |
| Language            | TypeScript (strict)                                           |
| Database            | MongoDB via Mongoose (`@nestjs/mongoose`)                     |
| Cache / sessions    | Redis via `ioredis` (optional, feature-flagged)              |
| Auth                | JWT access + refresh tokens (`passport-jwt`), RBAC guards     |
| Validation          | `class-validator` + `class-transformer` (global pipe)         |
| Config              | `@nestjs/config` with fail-fast env validation                |
| Logging             | `nestjs-pino` (structured, request-scoped, redacted)          |
| API docs            | OpenAPI / Swagger (`@nestjs/swagger`)                         |
| Rate limiting       | `@nestjs/throttler`                                           |
| Security            | `helmet`, CORS, `compression`                                 |
| Health checks       | `@nestjs/terminus`                                            |
| Tooling             | ESLint 9 (flat) · Prettier · Husky · lint-staged · commitlint |

---

## Architecture

A layered, modular architecture with a clear separation of concerns:

```
Controller  →  Service  →  Repository  →  Mongoose Model
  (HTTP)       (business)   (data access)   (persistence)
```

- **Controllers** handle HTTP only — routing, validation, serialization. No business logic.
- **Services** own business rules and orchestration. They speak DTOs, not raw documents.
- **Repositories** extend a generic `AbstractRepository` for consistent, typed CRUD + pagination.
- **Cross-cutting concerns** (auth, validation, error handling, response shaping, logging,
  rate limiting) are applied **globally** via guards, pipes, filters and interceptors — so
  feature code stays focused on the domain.

Global wiring lives in [`src/app.module.ts`](src/app.module.ts):

- `APP_PIPE` → `ValidationPipe` (whitelist, transform, reject unknown fields)
- `APP_GUARD` → `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`
- `APP_FILTER` → `AllExceptionsFilter` (single error envelope)
- `APP_INTERCEPTOR` → `TransformInterceptor` (single success envelope) → `TimeoutInterceptor`

Authentication is **on by default**; opt routes out with `@Public()`.

---

## Project structure

```
src/
├── config/                 # Typed configuration + env validation (fail-fast)
├── common/                 # Cross-cutting building blocks (no business logic)
│   ├── constants/          #   Reflector metadata keys, app constants
│   ├── decorators/         #   @Public, @Roles, @CurrentUser, @ResponseMessage, ...
│   ├── dto/                #   PaginationQueryDto, PaginatedResponseDto
│   ├── enums/              #   Role, ...
│   ├── filters/            #   AllExceptionsFilter
│   ├── guards/             #   RolesGuard
│   ├── interceptors/       #   TransformInterceptor, TimeoutInterceptor
│   ├── interfaces/         #   ApiResponse, AuthenticatedUser, ...
│   └── pipes/              #   ParseObjectIdPipe
├── database/               # Mongoose connection + AbstractRepository/AbstractDocument
├── redis/                  # Optional Redis client + RedisService (feature-flagged)
├── health/                 # Liveness/readiness probes (Mongo, memory, Redis)
├── modules/                # Feature modules (the domain)
│   ├── auth/               #   Register / login / refresh / logout (JWT)
│   └── users/              #   Reference CRUD module — mirror this pattern
├── app.module.ts           # Root module: global providers + wiring
└── main.ts                 # Bootstrap: security, versioning, Swagger, shutdown hooks
```

---

## Getting started

### Prerequisites

- Node.js **>= 20** (see `.nvmrc` → 22)
- MongoDB running locally, **or** use Docker Compose (below)

### Local development

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env      # then edit secrets (a ready-to-go .env is already included for dev)

# 3. Start MongoDB (if you don't have one running)
docker compose up -d mongo

# 4. Run in watch mode
npm run start:dev
```

The API will be available at:

- Base URL: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/docs`
- Health check: `http://localhost:3000/api/v1/health`

### Full stack with Docker

Builds the API image and starts MongoDB + Redis:

```bash
docker compose up --build
```

---

## Environment variables

All variables are validated on boot — the app **refuses to start** if anything required
is missing or malformed. See [`.env.example`](.env.example) for the full annotated list and
[`src/config/env.validation.ts`](src/config/env.validation.ts) for the rules.

Key ones: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (each ≥ 16 chars).
Generate secrets with `openssl rand -hex 32`.

---

## Available scripts

| Script                 | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run start:dev`    | Run with hot-reload                          |
| `npm run start:prod`   | Run compiled output (`dist/`)                |
| `npm run build`        | Compile to `dist/`                           |
| `npm run lint`         | Lint and auto-fix                            |
| `npm run lint:check`   | Lint without fixing (CI)                     |
| `npm run format`       | Prettier write                               |
| `npm test`             | Unit tests                                   |
| `npm run test:cov`     | Unit tests with coverage                     |
| `npm run test:e2e`     | End-to-end tests (requires MongoDB)          |

---

## Conventions & patterns

- **Validation**: every request body/query is a DTO decorated with `class-validator`.
  Unknown fields are rejected.
- **Errors**: throw Nest `HttpException`s (or let Mongoose errors bubble) — the global
  filter formats them. Never hand-format error responses.
- **Auth**: protected by default. Use `@Public()` to open a route, `@Roles(Role.Admin)`
  to restrict, and `@CurrentUser()` to read the authenticated principal.
- **IDs**: validate path params with `ParseObjectIdPipe`.
- **Pagination**: accept `PaginationQueryDto`, return `PaginatedResponseDto` (use
  `@ApiPaginatedResponse()` for docs).
- **Serialization**: never return raw documents — map to a `*ResponseDto` so secrets
  (password/refresh-token hashes) can never leak.
- **Commits**: Conventional Commits, enforced by commitlint + Husky.

---

## API response shape

Every successful response uses one envelope:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "OK",
  "data": { "...": "..." },
  "timestamp": "2026-06-03T10:00:00.000Z",
  "path": "/api/v1/users/me",
  "requestId": "..."
}
```

Every error uses its mirror:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errorCode": "BAD_REQUEST",
  "errors": ["email must be an email"],
  "timestamp": "2026-06-03T10:00:00.000Z",
  "path": "/api/v1/auth/register",
  "requestId": "..."
}
```

---

## Adding a new feature module

Mirror the `users` module:

```bash
nest g module modules/expenses
nest g controller modules/expenses
nest g service modules/expenses
```

Then:

1. Create `schemas/expense.schema.ts` extending `AbstractDocument`.
2. Create `expenses.repository.ts` extending `AbstractRepository<Expense>`.
3. Add `CreateExpenseDto`, `UpdateExpenseDto`, `ExpenseResponseDto`.
4. Register the model in the module with `MongooseModule.forFeature([...])`.
5. Import the module in `AppModule`.

---

## Domain roadmap

The foundation is in place; the finance domain will be built as feature modules under
`src/modules/`:

- **categories** — categorise expenses (food, rent, travel, …) for analysis
- **expenses** — daily expense tracking (amount, category, date, notes, attachments)
- **groups** — friend groups for shared expenses
- **splits / settlements** — split an expense across people and settle balances
- **income** — salary & other income, with pay dates
- **emis** — recurring EMIs with due dates
- **budgets** — monthly budgets per category
- **goals** — savings goals (target amount + date)
- **investments** — investment holdings & contributions
- **analytics** — category-wise breakdowns, month planning (income − EMIs − spend),
  trends and insights

> This README documents the scaffolding decisions; see inline JSDoc in `src/` for details.
