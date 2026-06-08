# Spendes — Frontend Plan & Backend Handoff

Everything the **Expo / React Native** app needs to talk to the Spendes backend, using
**TanStack Query** for data fetching. Pair this with the live API docs:

- **Swagger UI:** `http://localhost:3000/docs` (exhaustive request/response schemas)
- **Postman:** [`../postman/Spendes.postman_collection.json`](../postman/Spendes.postman_collection.json) (81 requests, auto-chains tokens/ids)
- **Smoke test:** [`../scripts/smoke-test.ps1`](../scripts/smoke-test.ps1) (the exact happy-path flows, 93 assertions)
- **Design brief:** `../../design/claude-design-prompt.md`

---

## 1. Stack

| Concern | Choice |
| ------- | ------ |
| App | Expo (managed) + React Native, TypeScript |
| Navigation | `expo-router` (file-based) or React Navigation |
| Data fetching | **TanStack Query** (`@tanstack/react-query`) |
| HTTP | `axios` (one instance + interceptors) |
| Secure token storage | `expo-secure-store` |
| Forms + validation | `react-hook-form` + `zod` (mirror backend rules) |
| UPI deep links | `expo-linking` (`Linking.openURL(upiUri)`) |
| Contacts (friends) | `expo-contacts` (read phone numbers to invite) |
| Charts | `victory-native` or `react-native-svg` (donut/line) |
| Dates | `date-fns` |

---

## 2. API fundamentals

**Base URL:** `http://<host>:3000/api/v1`
On a physical device `localhost` won't reach your dev machine — use the LAN IP (or
`Constants.expoConfig?.hostUri?.split(':')[0]`). Put it in an env/config constant.

**Every response uses one envelope.** Unwrap `.data` once in the axios layer.

```jsonc
// Success
{ "success": true, "statusCode": 200, "message": "...", "data": { /* payload */ },
  "timestamp": "...", "path": "...", "requestId": "..." }

// Error  (axios will reject; read err.response.data)
{ "success": false, "statusCode": 400, "message": "Validation failed",
  "errorCode": "BAD_REQUEST",
  "errors": [{ "field": "phoneNumber", "message": "..." }],   // optional, field-level
  "timestamp": "...", "path": "...", "requestId": "..." }

// Paginated payloads (the `data` for list endpoints)
{ "items": [ /* ... */ ],
  "meta": { "page": 1, "limit": 20, "totalItems": 42, "totalPages": 3,
            "hasPreviousPage": false, "hasNextPage": true } }
```

**Conventions**
- **Money:** major units (rupees), already rounded to 2dp. No paise integers on the wire.
- **Dates:** ISO-8601 strings in/out. Send `YYYY-MM-DD` or full ISO; server coerces.
- **Auth:** `Authorization: Bearer <accessToken>` on everything except auth + health.
- **IDs:** Mongo ObjectId strings (24 hex chars).
- **List query params:** `page`, `limit` (≤100), `sortBy`, `sortOrder` (`asc`/`desc`),
  `search`, plus per-resource filters.

---

## 3. Auth flow (phone + OTP, no password)

```
POST /auth/otp/request { dialCode?, phoneNumber }  → { isRegistered, expiresInSeconds, mocked }
  ├─ isRegistered=false → POST /auth/register { ...phone, firstName, lastName, email?, defaultCurrency?, otp } → { user, tokens }
  └─ isRegistered=true  → POST /auth/login    { ...phone, otp } → { user, tokens }

POST /auth/refresh { refreshToken } → { accessToken, refreshToken, tokenType, expiresIn }
POST /auth/logout  (Bearer)        → { revoked }
```

- Dev: `mocked=true` and the OTP is always **`123456`** (no SMS sent).
- `tokens` = `{ accessToken, refreshToken, tokenType: "Bearer", expiresIn }` (expiresIn in seconds).
- **Store both tokens in `expo-secure-store`.** Attach access token via an axios request
  interceptor; on `401`, transparently call `/auth/refresh` once and retry (see §4).
- `dialCode` defaults to `+91`; `phoneNumber` is 10 digits.

---

## 4. API client + auth interceptor (sketch)

```ts
// api/client.ts
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const api = axios.create({ baseURL: `${API_HOST}/api/v1`, timeout: 20000 });

// Attach access token
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Unwrap envelope + refresh-on-401 (single-flight)
let refreshing: Promise<string | null> | null = null;
api.interceptors.response.use(
  (res) => res.data.data,                         // <-- callers receive the payload directly
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshing ??= refreshTokens();             // de-dupe concurrent refreshes
      const newAccess = await refreshing.finally(() => (refreshing = null));
      if (newAccess) {
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
      await signOut();                            // refresh failed → clear + route to onboarding
    }
    return Promise.reject(error.response?.data ?? error);  // reject with the error envelope
  },
);
```

> Because the response interceptor returns `res.data.data`, your query/mutation functions
> get the **payload** directly (e.g. a paginated `{ items, meta }` or an entity).

---

## 5. TanStack Query conventions

**Query keys** — one factory per resource so invalidation is precise:

```ts
export const qk = {
  me: ['me'] as const,
  expenses: (filters?: object) => ['expenses', filters ?? {}] as const,
  expenseSummary: (range?: object) => ['expenses', 'summary', range ?? {}] as const,
  income: (filters?: object) => ['income', filters ?? {}] as const,
  groups: ['groups'] as const,
  group: (id: string) => ['groups', id] as const,
  groupExpenses: (id: string) => ['groups', id, 'expenses'] as const,
  groupBalances: (id: string) => ['groups', id, 'balances'] as const,
  friends: ['friends'] as const,
  friend: (id: string) => ['friends', id] as const,
  budgets: ['budgets'] as const,
  emis: ['emis'] as const, emiSummary: ['emis', 'summary'] as const,
  goals: ['goals'] as const,
  investments: ['investments'] as const, portfolio: ['investments', 'summary'] as const,
  analyticsOverview: ['analytics', 'overview'] as const,
  cashflow: (months: number) => ['analytics', 'cashflow', months] as const,
};
```

**Lists** → `useInfiniteQuery` (the `meta.hasNextPage` drives `getNextPageParam`).
**Mutations** → `useMutation` + `queryClient.invalidateQueries`.

### ⚠️ The most important frontend rule — invalidation cascade
A split **materializes the payer's/members' share into their personal expenses**. So a
**group or friend expense mutation must invalidate personal-finance queries too**, not just
the group's:

```ts
// after create/update/delete of a group OR friend expense, or a settlement:
invalidate(qk.groupExpenses(groupId));     // or friend(id)
invalidate(qk.groupBalances(groupId));
invalidate(qk.friends);                    // friend balances
invalidate(['expenses']);                  // ← share rows appear/disappear here
invalidate(['expenses', 'summary']);
invalidate(qk.budgets);                    // ← budgets count shares
invalidate(['analytics']);                 // ← overview + cashflow read everything
```

Likewise, a plain **expense/income create** should invalidate `budgets` and `analytics`.

---

## 6. Endpoint catalog (by module)

> Request/response field lists below are the essentials; Swagger has the exhaustive schema.
> All are `Bearer`-authed and under `/api/v1`.

### Auth — `/auth`
| Method · Path | Body | Returns |
| --- | --- | --- |
| POST `/auth/otp/request` | `{ dialCode?, phoneNumber }` | `{ isRegistered, expiresInSeconds, mocked }` |
| POST `/auth/register` | `{ dialCode?, phoneNumber, firstName, lastName, email?, defaultCurrency?, otp }` | `{ user, tokens }` |
| POST `/auth/login` | `{ dialCode?, phoneNumber, otp }` | `{ user, tokens }` |
| POST `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken, tokenType, expiresIn }` |
| POST `/auth/logout` | — | `{ revoked }` |

### Users — `/users`
- `GET /users/me` → user. `PATCH /users/me` `{ firstName?, lastName?, email?, avatarUrl?, defaultCurrency?, upiId? }`.
- **User shape:** `{ id, dialCode, phoneNumber, phoneE164, email?, firstName, lastName, fullName, avatarUrl?, roles[], plan, upiId?, defaultCurrency, isPhoneVerified, isEmailVerified, isActive, lastLoginAt?, createdAt, updatedAt }`.
- `plan` is `free`/`pro` (read-only here); set `upiId` (e.g. `name@okhdfcbank`) to **receive** UPI settle-ups.
- Admin only: `GET /users`, `GET/DELETE /users/:id`.

### Categories — `/categories`
- `GET /categories?type=expense|income&search=` → **array** (not paginated). Each: `{ id, name, slug, type, icon, color, iconUrl?, description?, isSystem, isActive, sortOrder }`.
- Admin: `POST/PATCH/DELETE`. `icon` is an **Ionicons** glyph name; `color` is hex — render directly.

### Expenses — `/expenses`
- `POST /expenses` `{ amount, category, currency?, description?, merchant?, paymentMethod?, spentAt?, notes?, tags? }`.
- `GET /expenses` (paginated) filters: `category, paymentMethod, source, from, to, minAmount, maxAmount, search`.
- `GET /expenses/summary?from&to` → `{ totalAmount, count, byCategory[], byPaymentMethod[] }`.
- `GET/PATCH/DELETE /expenses/:id`.
- **Expense shape adds:** `source` (`personal` | `group_share`), `groupId?`, `groupExpenseId?`.
  Rows with `source=group_share` are your split shares — **display read-only** and deep-link to
  the group/friend; `PATCH`/`DELETE` on them return `400` (manage via the group).

### Income — `/income`
- `POST /income` `{ amount, category, source?, currency?, description?, receivedVia?, receivedAt?, notes?, tags?, isRecurring? }`.
- `GET /income` (paginated, filters `category, receivedVia, from, to, minAmount, maxAmount, search`).
- `GET /income/summary` → `{ totalAmount, count, byCategory[], bySource[] }`. `GET/PATCH/DELETE /income/:id`.

### Groups — `/groups`
- `POST /groups` `{ name, description?, currency?, avatarUrl?, members?: [{ userId? | phoneNumber, dialCode?, displayName?, role? }] }`.
- `GET /groups` (paginated; **direct/friend groups are excluded**). `GET /groups/:id`. `PATCH/DELETE /groups/:id` (admin).
- Members: `POST /groups/:id/members`, `PATCH/DELETE /groups/:id/members/:memberId`.
- **Group shape:** `{ id, name, description?, avatarUrl?, currency, kind, createdBy, members[], memberCount, myRole?, isActive, createdAt, updatedAt }`.
  Each member: `{ id, userId?, displayName, role, status, dialCode?, phoneNumber?, isYou, isRegistered, joinedAt }`.
  `kind` is `standard`; **member `id` (not userId) is what splits/settlements reference.**
- Invite by phone: unknown number → `status:"invited"` placeholder that **auto-links** when that
  phone registers.

### Splits — `/groups/:groupId/...`
- `POST /expenses` `{ description, amount, currency?, category?, spentAt?, notes?, paidBy: [{ memberId, amount }], splitStrategy, splits: [{ memberId, exactAmount?|percentage?|shares? }] }`.
  - `splitStrategy` ∈ `equal | exact | percentage | shares`. For `equal`, splits entries need only `memberId`. `paidBy` amounts must sum to `amount`; `exact` splits sum to `amount`; `percentage` sums to 100.
- `GET /expenses` (paginated). `GET/PATCH/DELETE /expenses/:expenseId` (PATCH = metadata only; creator/admin).
- `GET /balances` → `{ groupId, currency, balances: [{ memberId, displayName, net }], suggestedTransfers: [{ fromMemberId, fromName, toMemberId, toName, amount }], myMemberId?, myNet? }`. `net` > 0 = owed to them.
- `POST /settlements` `{ fromMemberId?, toMemberId, amount, currency?, method?, note?, settledAt? }` (the "mark as paid" record).
- `GET /settlements` (paginated). `POST /settlements/intent` `{ toMemberId, amount, note? }` → `{ provider, uri, payeeName, payeeVpa, amount, currency, note? }` — open `uri` with `Linking`. Requires the payee to be registered **and** have a `upiId` (else `400`).

### Friends — `/friends` (1-on-1, reuses the splits engine under the hood)
- `POST /friends` `{ userId? | phoneNumber, dialCode?, displayName? }` → friend (idempotent — re-adding reuses the friendship).
- `GET /friends` → `{ friends: [Friend], totalYouAreOwed, totalYouOwe, net }`.
- `GET /friends/:friendshipId` → Friend. **Friend shape:** `{ friendshipId, myMemberId, friendMemberId, displayName, userId?, isRegistered, dialCode?, phoneNumber?, currency, net, createdAt, updatedAt }` (`net` > 0 = they owe you).
- `POST/GET /friends/:friendshipId/expenses` — **same body as group splits** (use `myMemberId`/`friendMemberId` in `paidBy`/`splits`); returns a `GroupExpenseResponse`.
- `POST /friends/:friendshipId/settlements` and `POST /friends/:friendshipId/settlements/intent` — same shapes as splits.
- The `friendshipId` is the underlying direct group's id; expenses returned look like group expenses.

### Budgets — `/budgets`
- `POST /budgets` `{ name?, category?, amount, currency?, period, startDate?, endDate?, alertThresholdPct?, isActive? }` (`period` ∈ `weekly|monthly|yearly|custom`; custom needs start+end).
- `GET /budgets` (paginated; filters `period`, `activeOnly`). `GET/PATCH/DELETE /budgets/:id`.
- **Budget shape adds computed:** `periodStart, periodEnd, spent, remaining, percentUsed, status` (`ok|warning|exceeded`). `spent` **includes group/friend shares**.

### EMIs — `/emis`
- `POST /emis` `{ name, type, amount, frequency, startDate, currency?, category?, paymentMethod?, interestRatePct?, principal?, tenureCount?, autoDebit?, isActive?, notes? }`
  (`type` ∈ `loan|subscription|rent|insurance|other`; `frequency` ∈ `weekly|monthly|quarterly|yearly`; `tenureCount` = finite installments, omit for indefinite).
- `GET /emis` (paginated; filters `type`, `activeOnly`). `GET/PATCH/DELETE /emis/:id`.
- `GET /emis/summary` → `{ activeCount, totalMonthlyCommitment, totalOutstanding, dueThisMonth: { count, total }, byType[] }`.
- **EMI shape adds computed:** `nextDueDate?, installmentsPaid, installmentsRemaining?, remainingAmount?, endDate?, isCompleted, monthlyEquivalent, dueThisMonth`.

### Goals — `/goals`
- `POST /goals` `{ name, targetAmount, currentAmount?, currency?, targetDate?, icon?, color?, notes? }`.
- `POST /goals/:id/contribute` `{ amount, note?, contributedAt? }` (atomic; bumps `currentAmount`).
- `GET /goals` (paginated; `activeOnly`). `GET/PATCH/DELETE /goals/:id`.
- **Goal shape adds computed:** `progressPct, remainingAmount, isAchieved, daysRemaining?, monthsRemaining?, requiredMonthlySaving?`, plus `contributions: [{ id, amount, note?, contributedAt }]`.

### Investments — `/investments`
- `POST /investments` `{ name, type, investedAmount, currentValue?, currency?, quantity?, platform?, notes?, isActive? }` (`type` ∈ `mutual_fund|stock|fd|gold|crypto|bond|real_estate|other`; `currentValue` defaults to invested).
- `GET /investments` (paginated; `type`, `activeOnly`). `GET/PATCH/DELETE /investments/:id` (PATCH to refresh `currentValue`).
- `GET /investments/summary` → `{ holdingsCount, totalInvested, totalCurrentValue, totalGainLoss, gainLossPct, allocation: [{ type, currentValue, investedAmount, percent }] }`.
- **Investment shape adds computed:** `gainLoss, gainLossPct`.

### Analytics — `/analytics`
- `GET /analytics/overview` → `{ period:{from,to}, income, expense, net, savingsRate, topCategories:[{category,totalAmount}], commitments:{totalMonthlyCommitment, dueThisMonthCount, dueThisMonthTotal}, portfolio:{totalInvested,totalCurrentValue,totalGainLoss,gainLossPct}, netWorth:{assets,liabilities,net} }`.
- `GET /analytics/cashflow?months=6` → `{ months, from, to, series:[{year,month,label,income,expense,net}], totalIncome, totalExpense, net }`.
- Net worth is **partial** (assets = investments value + goal savings; liabilities = EMI outstanding; **no bank cash** yet) — label it as such.

---

## 7. Enums (mirror these in the app)

| Enum | Values |
| --- | --- |
| PaymentMethod | `cash, card, upi, bank_transfer, wallet, other` |
| SplitStrategy | `equal, exact, percentage, shares` |
| GroupRole | `admin, member` · GroupMemberStatus `active, invited, removed` · GroupKind `standard, direct` |
| ExpenseSource | `personal, group_share` |
| BudgetPeriod | `weekly, monthly, yearly, custom` · status `ok, warning, exceeded` |
| EmiType | `loan, subscription, rent, insurance, other` · EmiFrequency `weekly, monthly, quarterly, yearly` |
| InvestmentType | `mutual_fund, stock, fd, gold, crypto, bond, real_estate, other` |
| CategoryType | `expense, income` · PlanType `free, pro` · Role `user, admin` |

---

## 8. Screen → data map

| Screen | Reads | Writes |
| --- | --- | --- |
| Onboarding / OTP | `otp/request` | `register` / `login` |
| Home dashboard | `analytics/overview`, `friends`, recent `expenses` | quick-add |
| Add expense/income | `categories` | `expenses` / `income` |
| Transactions | `expenses` (+`source` badge), `expenses/summary` | edit/delete (personal only) |
| Groups list / detail | `groups`, `groups/:id`, `…/expenses`, `…/balances` | create group, add member, add split |
| Add split | group `members` | `…/expenses` (strategy) |
| Settle up | `…/balances` | `…/settlements/intent` → UPI, then `…/settlements` |
| Friends | `friends`, `friends/:id`, `…/expenses` | add friend, split, settle |
| Budgets | `budgets` | create/update budget |
| EMIs | `emis`, `emis/summary` | create/update EMI |
| Goals | `goals` | create goal, `contribute` |
| Investments | `investments`, `investments/summary` | add holding, refresh value |
| Analytics | `analytics/overview`, `analytics/cashflow` | — |
| Profile | `users/me` | `PATCH /users/me` (upiId, currency) |

---

## 9. Suggested build order
1. **Foundation** — Expo app, navigation shell, QueryClientProvider, `api/client.ts` + secure
   token storage + refresh interceptor, the auth screens (OTP → register/login), `me` query,
   an auth gate.
2. **Core money** — Add expense/income, transactions list (infinite query), categories picker,
   summary. Wire the invalidation cascade helpers.
3. **Social** — Groups (list/detail/members/invite), the 4-strategy split editor, balances,
   settle-up (UPI `Linking` + mark-as-paid), then Friends (reuse the split editor).
4. **Plan** — Budgets, EMIs, Goals, Investments (each is straightforward CRUD + a summary card).
5. **Understand** — Analytics dashboard (overview + cash-flow charts) and the Home dashboard.
6. **Polish** — empty/loading skeletons, dark mode, haptics, the Pro upsell placeholder.

---

## 10. Gotchas worth repeating
- **Split shares are read-only personal expenses** — never `PATCH`/`DELETE` a `group_share` row
  directly; the cascade keeps them in sync.
- **A friend == a 2-person group** under the hood; `friendshipId` plugs into the same split body.
- **Settle-up has no webhook** — open the UPI deep link, then have the user confirm → you `POST`
  the settlement. Balances recompute on read.
- **Entitlements are dormant** (`ENTITLEMENTS_ENFORCED=false`): everyone is effectively `pro`.
  Build the Pro UI as a placeholder; no endpoint is paywalled yet.
- **Currency** is per-record; defaults to the user's `defaultCurrency` (INR). The app is
  single-currency for the MVP.
