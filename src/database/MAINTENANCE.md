# Database maintenance scripts (dev/testing)

Small `tsx` scripts for resetting test data. They all read the same `MONGODB_URI`
/ `MONGODB_DB_NAME` the app uses, and they **refuse to run when `NODE_ENV=production`**.

> The two destructive scripts default to a **DRY RUN** — they only report what
> _would_ be deleted. Add `--yes` to actually delete. (`--` passes flags through npm.)

| Command | What it does |
| --- | --- |
| `npm run db:stats` | Read-only. Prints a document count per collection + total. |
| `npm run db:reset` | Wipes all user-generated data, **keeps `users`, `categories`, `waitlist`**. |
| `npm run db:delete-user -- <userId\|phone>` | Removes one user and everything tied to them. |

## Reset everything (keep accounts + categories)

```bash
npm run db:reset                 # preview (dry run)
npm run db:reset -- --yes        # actually wipe
```

Cleared: expenses, income, budgets, emis, goals, investments, groups, splits,
settlements, notifications, push tokens, otp codes.
**Preserved:** `users` (stay signed up), `categories` (your seeded reference data),
`waitlist` (landing-page signups). After an apply it also re-runs the category seed
so the defaults are guaranteed to exist.

## Delete one user (by id or phone)

```bash
npm run db:delete-user -- 665f0c1b2a...         # preview by 24-char id
npm run db:delete-user -- 9876543210 --yes      # delete by phone
npm run db:delete-user -- 9876543210 --yes --keep-user   # wipe their data, keep the login
```

- Personal data (expenses/income/budgets/emis/goals/investments/push tokens) is deleted.
- Notifications they received **or** triggered are deleted.
- Groups they **own** are torn down fully (group + its splits + settlements).
- In groups owned by **others**, only the splits/settlements they authored are
  removed and they're dropped from the member list — the shared group is kept.
- **Categories are never touched.**

## Adding a new model later

These scripts enumerate `mongoose.models` via [`models.registry.ts`](./models.registry.ts).
When you add a model, add one `export … from …` line there so the scripts see it
(and decide whether it belongs in `db:reset`'s preserve-list).
