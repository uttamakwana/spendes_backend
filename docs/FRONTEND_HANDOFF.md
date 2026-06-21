# Spendes — Frontend Handoff

> Personal-finance backend: track income, daily expenses, EMIs, SIPs/investments,
> budgets, savings goals, and friend splits — all wired into one analytics layer that
> answers _"am I on track, who owes whom, what's my real disposable income?"_
>
> This doc is the contract for building the app UI against the existing API. It
> reflects the backend as of the **finance-domain + SIP/feasibility** work (June 2026).

---

## 1. Conventions

- **Base URL:** `/api/v1`
- **Auth:** every feature route requires `Authorization: Bearer <accessToken>` (obtain via `/api/v1/auth`). All data is owner-scoped server-side; a miss returns `404` (never reveals other users' data).
- **Money:** stored/returned as major units (e.g. `45000` = ₹45,000), rounded to 2 decimals. `currency` is a 3-letter ISO code; defaults to the user's `defaultCurrency`, else `INR`.
- **Dates:** ISO-8601 strings in/out. `coerce`d on input, so `"2026-06-05"` works.
- **Success envelope** — every 2xx response (except `204`) is wrapped:

```jsonc
{
  "success": true,
  "statusCode": 200,
  "message": "Investment created successfully",
  "data": { /* the actual payload documented below */ },
  "timestamp": "2026-06-13T10:00:00.000Z",
  "path": "/api/v1/investments",
  "requestId": "..."
}
```

- **Lists** return `data: { items: [...], meta: { page, limit, totalItems, totalPages, hasPreviousPage, hasNextPage } }`. Standard query params: `page`, `limit`, plus per-module filters.
- **Errors** use the matching `ApiErrorResponse` envelope with `success: false` and an HTTP status (`400` validation, `401` auth, `404` not found).

---

## 2. The data model at a glance

| Domain | What it is | Recurrence / dates | Key derived-on-read fields |
|---|---|---|---|
| **Income** | Money received | `receivedAt` date + `isRecurring` flag | category/source breakdowns |
| **Expenses** | Daily spend (split-aware) | `spentAt` date | `cashOutflow` vs consumption |
| **EMIs** | Recurring obligations (loan/rent/subscription) | `frequency` + `startDate` (+ `tenureCount`) | next due, paid/remaining, completion |
| **Investments** | Holdings + **SIP plans** | `sip.frequency` + `sip.startDate` | gain/loss, SIP schedule, contributions history |
| **Budgets** | Spend caps | `period` (weekly/monthly/yearly/custom) + optional `category` | spent, remaining, %used, status |
| **Goals** | Savings targets | `targetDate` | progress %, required monthly saving |
| **Friends/Splits** | Who owes whom | — | net balance per friend, suggested transfers |
| **Analytics** | Composition layer | — | overview, cashflow, **goal feasibility** |

Everything time-varying (gain/loss, "spent so far", next due date, goal progress, owe/owed) is **computed on read** — the frontend never has to recompute or keep totals in sync.

---

## 3. What's new in this iteration

Three gaps were closed so the modules truly interconnect:

1. **Investments now model recurring SIPs with full contribution history.** A holding can carry a `sip` plan (amount + frequency + start date) and a `contributions[]` history. `investedAmount` is the denormalized sum of contributions and grows as you record installments.
2. **Goal feasibility** — a new analytics read that compares your monthly **disposable income** (income − expenses − EMI − SIP) against what each goal needs per month, and tells you if you're on track.
3. **Analytics overview** now also surfaces **owe/owed** (friend balances) and a compact **goals on-track** summary.

The rest of this doc focuses on these, then lists the full endpoint surface.

---

## 4. Investments + SIP

### Model (response shape)

```jsonc
{
  "id": "665...",
  "userId": "664...",
  "name": "Nifty 50 Index Fund",
  "type": "mutual_fund",          // mutual_fund | stock | fd | gold | crypto | bond | real_estate | other
  "investedAmount": 65000,        // cost basis = sum of contributions
  "currentValue": 71200,          // latest market value (user-updated)
  "currency": "INR",
  "quantity": 412.5,              // optional
  "platform": "Groww",            // optional
  "notes": "Long term",           // optional
  "gainLoss": 6200,               // currentValue - investedAmount
  "gainLossPct": 9.54,
  "sip": {                        // present only when a SIP plan is attached
    "amount": 5000,
    "frequency": "monthly",       // weekly | monthly | quarterly | yearly
    "startDate": "2026-01-05T00:00:00.000Z",
    "isActive": true,
    "monthlyEquivalent": 5000,    // normalized to a monthly figure (for commitment totals)
    "nextContributionDate": "2026-07-05T00:00:00.000Z",  // omitted if plan paused
    "expectedInstallments": 6,    // how many SIP dates have passed since startDate
    "recordedInstallments": 6,    // contributions actually logged
    "installmentsBehind": 0       // max(0, expected - recorded)
  },
  "contributions": [
    { "id": "..", "amount": 50000, "note": "Initial investment", "investedAt": "2026-01-05T..." },
    { "id": "..", "amount": 5000,  "note": "SIP Feb",            "investedAt": "2026-02-05T..." }
  ],
  "isActive": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Key behaviors for the UI:**
- On create, if `investedAmount > 0`, the backend seeds an **initial contribution** automatically (so `investedAmount === sum(contributions)` always holds). Don't post a duplicate initial contribution.
- The SIP "particular date it debits" = the **day-of-month of `sip.startDate`**. There's no separate `dayOfMonth` field.
- `installmentsBehind > 0` is your cue to nudge the user: _"You've missed N SIP entries — record them?"_
- `currentValue` only moves when the user updates it (no live price feed). Surface an "update value" action.

### Endpoints

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/investments` | create (below) | `name`, `type`, `investedAmount` required; `sip` optional |
| `GET` | `/investments` | — | list; query: `page`, `limit`, `type`, `activeOnly` |
| `GET` | `/investments/summary` | — | portfolio totals (below) |
| `GET` | `/investments/:id` | — | single holding |
| `POST` | `/investments/:id/contribute` | contribute (below) | record a SIP installment / top-up |
| `PATCH` | `/investments/:id` | partial of create | edit fields / refresh value / edit SIP |
| `DELETE` | `/investments/:id` | — | `204` |

**Create body** (lump-sum + monthly SIP on the 5th):
```jsonc
{
  "name": "Nifty 50 Index Fund",
  "type": "mutual_fund",
  "investedAmount": 50000,
  "currentValue": 50000,            // optional; defaults to investedAmount
  "platform": "Groww",
  "sip": {
    "amount": 5000,
    "frequency": "monthly",
    "startDate": "2026-01-05",
    "isActive": true                // optional, default true
  }
}
```

**Contribute body** (record this month's SIP, optionally refresh value in the same call):
```jsonc
{
  "amount": 5000,
  "note": "SIP June",               // optional
  "investedAt": "2026-06-05",       // optional, default now
  "currentValue": 71200             // optional — bumps market value too
}
```
Returns the full updated holding (`201`). `investedAmount` increases by `amount`.

**`GET /investments/summary`:**
```jsonc
{
  "holdingsCount": 3,
  "totalInvested": 130000,
  "totalCurrentValue": 142500,
  "totalGainLoss": 12500,
  "gainLossPct": 9.62,
  "totalMonthlySip": 8000,          // combined monthly-equivalent of active SIPs
  "allocation": [
    { "type": "mutual_fund", "currentValue": 71200, "investedAmount": 65000, "percent": 49.96 }
  ]
}
```

---

## 5. Goal feasibility (the "can I reach my goal?" answer)

`GET /analytics/goals` — composes income, expenses, EMIs, SIPs, and goals into a single feasibility read.

```jsonc
{
  "monthly": {
    "avgIncome": 45000,             // trailing 3-month average
    "avgExpense": 21000,            // trailing 3-month average
    "emiCommitment": 12000,         // monthly-equivalent of active EMIs
    "sipCommitment": 8000,          // monthly-equivalent of active SIPs
    "disposableForGoals": 4000,     // avgIncome - avgExpense - emi - sip
    "basisMonths": 3
  },
  "goals": [
    {
      "id": "...",
      "name": "Emergency Fund",
      "targetAmount": 100000,
      "currentAmount": 40000,
      "remainingAmount": 60000,
      "targetDate": "2026-12-31T...",
      "monthsRemaining": 7,
      "requiredMonthlySaving": 8571.43,   // null when goal has no target date
      "onTrack": false,                   // disposableForGoals >= requiredMonthlySaving
      "shortfall": 4571.43                // max(0, required - disposable)
    }
  ],
  "totals": {
    "activeGoals": 2,
    "totalRequiredMonthlySaving": 8571.43,
    "onTrackCount": 1,
    "allOnTrack": false,                  // disposable covers ALL dated goals at once
    "monthlySurplus": -4571.43            // disposable - totalRequired (negative = collective shortfall)
  }
}
```

**Modeling notes for the UI:**
- `disposableForGoals` deliberately **excludes** SIP money (it's already committed to investing). So this is the cash left for _goal_ saving specifically.
- Per-goal `onTrack` is judged **in isolation** (does disposable cover this one goal's pace). `totals.allOnTrack` judges whether disposable covers **every dated goal simultaneously**. Show both: a goal can be individually fundable yet collectively competing.
- A goal with **no `targetDate`** has `requiredMonthlySaving: null`, `onTrack: true` (no deadline pressure).
- Averages are smoothed over the last 3 months — expect them to be `0` for brand-new accounts with no history yet.

---

## 6. Analytics overview (home dashboard)

`GET /analytics/overview` — current-month snapshot + standing balances. Now includes `portfolio.totalMonthlySip`, `balances` (owe/owed), and `goals` (compact feasibility).

```jsonc
{
  "period": { "from": "2026-06-01T...", "to": "2026-06-30T..." },
  "income": 45000,
  "expense": 21000,                 // your consumption / share
  "cashOutflow": 24500,             // actual cash out (incl. amounts you fronted on splits)
  "net": 24000,
  "savingsRate": 53.33,
  "topCategories": [ { "category": "Food", "totalAmount": 6200 } ],
  "commitments": { "totalMonthlyCommitment": 12000, "dueThisMonthCount": 2, "dueThisMonthTotal": 12000 },
  "portfolio": { "totalInvested": 130000, "totalCurrentValue": 142500, "totalGainLoss": 12500, "gainLossPct": 9.62, "totalMonthlySip": 8000 },
  "balances": { "youAreOwed": 1500, "youOwe": 600, "net": 900 },
  "goals": { "activeCount": 2, "onTrackCount": 1, "allOnTrack": false, "totalRequiredMonthlySaving": 8571.43, "disposableForGoals": 4000 },
  "netWorth": { "assets": 182500, "liabilities": 48000, "net": 134500 }
}
```

`GET /analytics/cashflow?months=6` — income vs expense per month (oldest → newest) for charts. `months` is `1..24`, default `6`.

---

## 6a. App update prompt (force / soft update)

The app should ask the backend, **on every launch (and on resume)**, whether it needs to update — _before_ rendering the main UI, so a force-gate can block an unsupported build.

`GET /app/version?platform=android&version=1.4.2` — **public, no auth**. `platform` is `ios | android`; `version` is the installed build (`MAJOR.MINOR.PATCH`).

```jsonc
{
  "platform": "android",
  "currentVersion": "1.4.2",
  "latestVersion": "2.1.0",
  "minSupportedVersion": "2.0.0",
  "updateAvailable": true,      // currentVersion < latestVersion → soft, dismissible nudge
  "forceUpdate": true,          // currentVersion < minSupportedVersion → HARD gate, block the app
  "storeUrl": "https://play.google.com/store/apps/details?id=com.spendes",
  "releaseNotes": "Faster sync and bug fixes.",
  "maintenanceMode": false,     // when true: show a maintenance screen, block everything
  "maintenanceMessage": null
}
```

**Client logic:**
```
if (maintenanceMode)      → full-screen blocker with maintenanceMessage
else if (forceUpdate)     → non-dismissible "Update required" screen → storeUrl
else if (updateAvailable) → dismissible "Update available" banner/sheet → storeUrl
else                      → proceed normally
```

**Behavior notes:**
- **Fails open:** if a platform has no config yet, every flag is `false` and `storeUrl` is empty — the app never breaks on a missing/misconfigured backend.
- Version compare is numeric semver (`2.10.0 > 2.9.0`); pre-release/build suffixes after `-`/`+` are ignored.
- Send the **native build version** the user would update in the store (not the JS/OTA bundle version), since `storeUrl` points to the store.

**Admin (not for the app UI — ops/console):** bump thresholds when a build ships, no redeploy needed.
- `GET /app/version/config` — list all platform configs (admin).
- `PUT /app/version/:platform` — upsert: `{ latestVersion, minSupportedVersion, storeUrl, releaseNotes?, maintenanceMode?, maintenanceMessage? }` (admin).

---

## 7. Full endpoint surface (existing modules)

All under `/api/v1`, all authenticated. CRUD modules share the pattern: `POST /`, `GET /` (paginated + filters), `GET /summary` (where noted), `GET /:id`, `PATCH /:id`, `DELETE /:id`.

| Module | Base | Highlights |
|---|---|---|
| Auth | `/auth` | register/login → access token |
| Users | `/users` | profile, `defaultCurrency` |
| Categories | `/categories` | spend categories |
| **Income** | `/income` | `+ /summary`; fields: `amount`, `category`, `source`, `receivedVia`, `receivedAt`, `isRecurring`, `tags` |
| **Expenses** | `/expenses` | `+ /summary`; `amount`, `category`, `merchant`, `paymentMethod`, `spentAt`, `paidAmount`, split-aware |
| **EMIs** | `/emis` | `+ /summary`; `frequency`, `startDate`, `tenureCount`; response carries live schedule (next due, paid/remaining) |
| **Investments** | `/investments` | `+ /summary`, `+ POST /:id/contribute`; SIP plans + contributions (see §4) |
| **Budgets** | `/budgets` | `period` (weekly/monthly/yearly/custom), optional `category`, `alertThresholdPct`; response: spent/remaining/percentUsed/status |
| **Goals** | `/goals` | `+ POST /:id/contribute`; `targetAmount`, `targetDate`, contributions; response: progress + requiredMonthlySaving |
| **Groups** | `/groups` | shared groups; members can be phone-invited placeholders |
| **Splits** | `/groups/:groupId/...` | group expenses, settlements, balances, suggested transfers |
| **Friends** | `/friends` | 2-person direct splits; `GET /friends` returns per-friend `net` + `totalYouAreOwed`/`totalYouOwe`/`net` |
| **Analytics** | `/analytics` | `/overview`, `/cashflow`, **`/goals`** (see §5–6) |
| **App** | `/app` | `GET /version` (public update check, §6a); admin config endpoints |
| Notifications | `/notifications` | in-app notifications |
| Push | `/push` | Expo push token registration |

### Splits / Friends balance semantics
- Balances are **derived** from expenses (payers `+`, split members `−`) and settlements — never stored.
- A friend's `net`: **positive = friend owes you**, **negative = you owe the friend**.
- `GET /friends` aggregate: `totalYouAreOwed`, `totalYouOwe` (both positive numbers), `net`.
- Friends are 2-person "direct" groups; member ids are **group-member subdoc ids** (not user ids), so phone-invited people can carry a balance before they register.

---

## 8. Worked example — "User 1" (₹45k salary)

This is the scenario the product is built around; here's how each piece maps to a call:

1. **Salary on the 1st** → `POST /income` `{ amount: 45000, category: "Salary", receivedAt: "2026-06-01", isRecurring: true }`
2. **Daily expenses** → `POST /expenses` per spend with `spentAt`.
3. **Home-loan EMI on the 7th** → `POST /emis` `{ name, type: "loan", amount: 12000, frequency: "monthly", startDate: "2026-06-07", tenureCount: 60 }`. Response shows next due + installments remaining.
4. **Monthly SIP on the 5th** → `POST /investments` with a `sip` block (see §4). Each month, `POST /investments/:id/contribute` to log it; `currentValue` updates show portfolio moving up/down.
5. **Goal: ₹1L by Dec** → `POST /goals` `{ name, targetAmount: 100000, targetDate: "2026-12-31" }`, then `POST /goals/:id/contribute` to save toward it.
6. **Budget for Food** → `POST /budgets` `{ category: "Food", amount: 6000, period: "monthly" }`. Response tells you spent/remaining/status.
7. **Split with friends** → add a friend, log a shared expense, read `GET /friends` for owe/owed.
8. **The payoff** → `GET /analytics/overview` (dashboard) and `GET /analytics/goals` (is the ₹1L goal reachable given disposable income?).

---

## 9. Known limitations (so the UI sets honest expectations)

- **No live market prices** — `currentValue` is user-maintained; prompt for updates.
- **SIP/EMI are not auto-posted** — recording an installment is a manual action (`/contribute`). The recurring-transactions engine is a future module.
- **Feasibility averages need history** — trailing 3-month averages read `0` until the user has a couple of months of data; consider an onboarding/empty state.
- **Net worth excludes bank cash** — it covers investments + goal savings (assets) and outstanding EMI balances (liabilities) only.
- **Income recurrence is a flag**, not a schedule — `isRecurring` marks intent; there's no projected future-income engine yet.
```
