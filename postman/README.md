# Spendes — Postman collection

Import [`Spendes.postman_collection.json`](./Spendes.postman_collection.json) into Postman
(**Import → File**) to get every implemented endpoint with example bodies, auth wired up,
and scripts that auto-capture ids/tokens between requests.

## Setup

1. Start the API: `npm run start:dev` (serves `http://localhost:3000/api/v1`).
2. Keep `OTP_MOCK_ENABLED=true` (default) so every OTP is **`123456`**.
3. The collection ships with variables (`baseUrl`, `phoneNumber`, `otp`, …). Edit them under
   the collection's **Variables** tab if needed.

## Recommended run order (also a backend smoke test)

1. **Auth → Request OTP** → **Register** (saves `accessToken`, `refreshToken`, `userId`).
2. **Users → Get My Profile** / **Update My Profile** (set a `upiId` to receive settle-ups).
3. **Expenses** / **Income** — create, list, summary.
4. **Groups → Create Group** (saves `groupId`, `memberId1/2/3`).
5. **Splits - Group Expenses** — try Equal / Exact / Percentage / Shares.
6. **Splits - Balances → Get Group Balances** — verify "who owes whom".
7. **Splits - Settlements** — Record Settlement, then re-check balances.

## Notes

- Bearer auth is set at the collection level (`{{accessToken}}`); Register/Login/Refresh and
  the System endpoints override it to no-auth.
- **Admin** endpoints (list users, manage categories) need a user whose `roles` include
  `admin` — promote one in Mongo, then re-login.
- **Settlement intent** requires the *payee* to be a registered user with a `upiId`; paying a
  phone-only placeholder returns `400` by design.
- This collection is the de-facto API reference for the future frontend (RN/Expo) app.
