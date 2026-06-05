# Spendes — Backend API

Production-grade **Express.js + TypeScript** backend for **Spendes**, a personal-finance
platform for tracking and **splitting** expenses, budgeting, setting goals, and
analysing income vs. spending so users can plan each month with confidence.

Built with **Express 5 · TypeScript (strict) · MongoDB (Mongoose) · Zod · JWT auth · Swagger · Pino**.

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
- [Authentication flow](#authentication-flow)
- [Adding a new feature module](#adding-a-new-feature-module)
- [Domain roadmap](#domain-roadmap)

---

## Tech stack

| Concern          | Choice                                                        |
| ---------------- | ------------------------------------------------------------ |
| Framework        | Express 5                                                    |
| Language         | TypeScript (strict)                                          |
| Database         | MongoDB via Mongoose                                         |
| Cache / sessions | Redis via `ioredis` (optional, feature-flagged)             |
| Auth             | JWT access + refresh tokens (`jsonwebtoken`), role-based     |
| Validation       | `zod` (one schema → validation + types + OpenAPI)           |
| Config           | `zod`-validated env (fail-fast), typed config tree           |
| Logging          | `pino` + `pino-http` (structured, request-scoped, redacted)  |
| API docs         | OpenAPI / Swagger UI (`swagger-ui-express`, from Zod)        |
| Rate limiting    | `express-rate-limit`                                         |
| Security         | `helmet`, CORS, `compression`                                |
| Tooling          | ESLint 9 (flat) · Prettier · Husky · lint-staged · commitlint|

> Migrated from NestJS to plain Express while keeping the same layered design,
> auth model, and API contract.

---

## Architecture

A layered, modular architecture with a clear separation of concerns. Each request
flows through explicit Express middleware instead of framework "magic":

```
request
  → requestId            (correlation id, echoed as x-request-id)
  → requestLogger        (pino-http, secrets redacted)
  → helmet / cors / compression
  → body parsers
  → timeout              (408 on hung requests)
  → rate limiter         (429 on abuse)
  → route: validate(zod) → authenticate → authorize(role) → controller
                                                              → service
                                                              → repository → Mongoose model
  → notFoundHandler      (404 envelope for unknown routes)
  → errorHandler         (single error envelope for everything thrown)
```

**Layers inside a feature module**

- **routes** — wire URL + middleware (validation, auth, rate limit) to a controller.
- **controller** — thin HTTP adapter: read the (already-validated) request, call a
  service, write the success envelope. No business logic.
- **service** — business logic. Returns plain response objects, never raw documents.
- **repository** — data access. Extends `BaseRepository<TDocument>` for generic
  CRUD + pagination; adds domain-specific queries.
- **model** — the Mongoose schema + document type.
- **validation** — Zod schemas (the request DTOs). Inferred types flow into the code.

---

## Project structure

```
src/
├── server.ts                 # bootstrap: connect DB, listen, graceful shutdown
├── app.ts                    # Express app factory: middleware + routes wiring
├── routes.ts                 # mounts feature routers under /api/v1
├── logger.ts                 # Pino root logger + createLogger(context)
├── config/
│   ├── env.ts                # Zod env schema (fail-fast validation)
│   └── index.ts              # typed configuration tree
├── common/
│   ├── errors/               # HttpException family (BadRequest, NotFound, …)
│   ├── middleware/           # authorize, validate, rate-limit, timeout,
│   │                         #   request-id, request-logger, error-handler, …
│   ├── utils/                # response envelope, pagination, objectId
│   ├── types/                # api-response types, Express request augmentation
│   ├── validation/           # shared Zod schemas (phone)
│   └── enums/                # Role
├── database/
│   ├── connection.ts         # Mongoose connect + lifecycle logging
│   └── base.repository.ts    # generic CRUD + pagination
├── modules/
│   ├── auth/                 # phone + OTP auth, JWT, SMS provider
│   │   ├── auth.routes.ts / auth.controller.ts / auth.service.ts
│   │   ├── auth.validation.ts / auth.middleware.ts / jwt.service.ts
│   │   ├── otp/  (model · repository · service)
│   │   ├── phone/ (phone.service)
│   │   └── sms/  (types · console provider · service)
│   └── users/                # users CRUD + profile
│       ├── users.routes.ts / users.controller.ts / users.service.ts
│       ├── users.repository.ts / users.model.ts / users.validation.ts
│       └── user-response.ts  # entity → safe response mapper
├── health/                   # /health probe (Mongo, memory, Redis)
├── redis/                    # optional ioredis client + service
└── openapi/                  # OpenAPI document built from the Zod schemas
```

---

## Getting started

### Prerequisites

- Node.js ≥ 20
- A running MongoDB (local Windows service, Docker, or Atlas)
- (Optional) Redis — only if `REDIS_ENABLED=true`

### Install & run

```bash
npm install
cp .env.example .env          # then edit values (or keep the dev defaults)
npm run start:dev             # hot-reload dev server (tsx watch)
```

The API boots at `http://localhost:3000/api/v1` and Swagger UI at
`http://localhost:3000/docs`.

### Production build

```bash
npm run build                 # tsc → dist/
npm start                     # node dist/server.js
```

### Docker

```bash
docker compose up --build     # api + mongo + redis
```

---

## Environment variables

All variables are validated on boot (see [`src/config/env.ts`](src/config/env.ts));
the app refuses to start if anything required is missing or malformed. See
[`.env.example`](.env.example) for the full annotated list. Highlights:

| Variable                   | Default      | Notes                                              |
| -------------------------- | ------------ | -------------------------------------------------- |
| `MONGODB_URI`              | _(required)_ | Mongo connection string                            |
| `JWT_ACCESS_SECRET`        | _(required)_ | ≥ 16 chars                                         |
| `JWT_REFRESH_SECRET`       | _(required)_ | ≥ 16 chars, different from the access secret       |
| `OTP_MOCK_ENABLED`         | `true`       | dev: every code is `OTP_MOCK_CODE` and only logged |
| `OTP_MOCK_CODE`            | `123456`     | the fixed code while mocking                        |
| `SMS_PROVIDER`             | `console`    | only `console` is implemented today                 |
| `PHONE_ALLOWED_DIAL_CODES` | `+91`        | comma-separated, or `*` for any country             |
| `REDIS_ENABLED`            | `false`      | keep off until a caching layer is needed            |
| `SWAGGER_ENABLED`          | `true`       | serve Swagger UI at `SWAGGER_PATH`                  |

---

## Available scripts

| Script              | Description                         |
| ------------------- | ----------------------------------- |
| `npm run start:dev` | Hot-reload dev server (`tsx watch`) |
| `npm run build`     | Type-check + compile to `dist/`     |
| `npm start`         | Run the compiled server             |
| `npm run typecheck` | `tsc --noEmit`                      |
| `npm run lint`      | ESLint (auto-fix)                   |
| `npm run format`    | Prettier write                      |
| `npm test`          | Unit tests (Jest)                   |
| `npm run test:e2e`  | End-to-end smoke tests (supertest)  |

---

## Conventions & patterns

- **Every error is thrown, never returned.** Throw an `HttpException` subclass
  (`throw new NotFoundException()`); the central `errorHandler` turns it into the
  standard error envelope. `asyncHandler` forwards async rejections automatically.
- **Validation lives at the edge.** `validate({ body, query, params })` parses
  with Zod before the controller runs, so handlers receive typed, trusted input
  and unknown fields are stripped.
- **Services return responses, not documents.** Map entities through a
  `*-response` mapper so sensitive fields (e.g. the refresh-token hash) never leak.
- **Repositories extend `BaseRepository`.** Read methods return lean objects.
- **Singletons for wiring.** Each repository/service exports a ready instance
  (`export const usersService = new UsersService(...)`) — simple, explicit DI.

---

## API response shape

Every response uses one of two envelopes.

**Success**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profile retrieved successfully",
  "data": { "...": "..." },
  "timestamp": "2026-06-05T10:00:00.000Z",
  "path": "/api/v1/users/me",
  "requestId": "f0e1..."
}
```

**Error**

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errorCode": "BAD_REQUEST",
  "errors": [{ "field": "phoneNumber", "message": "phoneNumber must be exactly 10 digits" }],
  "timestamp": "2026-06-05T10:00:00.000Z",
  "path": "/api/v1/auth/login",
  "requestId": "f0e1..."
}
```

Paginated `data` is `{ items: [...], meta: { page, limit, totalItems, totalPages, hasPreviousPage, hasNextPage } }`.

---

## Authentication flow

Identity is a **phone number** — `(dialCode, phoneNumber)` — verified by **OTP**.
There is no password. Tokens are returned in the JSON body as **bearer** tokens
(ideal for the React Native / Expo app: store in expo-secure-store, attach via an
interceptor, refresh on 401).

```
POST /auth/otp/request   → { isRegistered, expiresInSeconds, mocked }
  ├─ isRegistered=false → POST /auth/register  (OTP + profile)  → { user, tokens }
  └─ isRegistered=true  → POST /auth/login     (OTP)            → { user, tokens }

POST /auth/refresh  (refreshToken)  → new { accessToken, refreshToken, ... }
POST /auth/logout   (Bearer)        → revokes the stored refresh token
```

In development (`OTP_MOCK_ENABLED=true`) every code is `123456` and is logged
instead of sent — no SMS account required. Swap in a real gateway by implementing
one `SmsProvider` class and adding a `case` in `sms.service.ts`.

---

## Adding a new feature module

Copy the **users** module as the template:

1. `xyz.model.ts` — Mongoose schema + `XyzDocument` interface (extends `BaseDocument`).
2. `xyz.repository.ts` — `class XyzRepository extends BaseRepository<XyzDocument>`; export a singleton.
3. `xyz.validation.ts` — Zod schemas for create/update/query.
4. `xyz-response.ts` — `toXyzResponse(doc)` mapper.
5. `xyz.service.ts` — business logic; export a singleton.
6. `xyz.controller.ts` — `asyncHandler` handlers calling the service + `sendSuccess`.
7. `xyz.routes.ts` — wire routes with `validate`, `authenticate`, `authorize`.
8. Mount the router in [`src/routes.ts`](src/routes.ts) and document it in
   [`src/openapi/document.ts`](src/openapi/document.ts).

---

## Domain roadmap

Planned feature modules under `src/modules/`: **categories, expenses, groups,
splits/settlements, income, EMIs, budgets, goals, investments, analytics.**
