# Bank connection (pillar 5 of 6): every purchase, not only the ones that email

Settings → **Bank** connects a bank or card account through Plaid. Each card purchase then becomes a
card-alert receipt and goes through the same matching an emailed alert gets: which card it was, credits
it used, protections it earned, double charges and subscriptions.

## How it works

1. **Opening the bank's sign-in.** The app asks the `bank` function for a link, and Plaid returns a
   **Hosted Link** page. The app opens it in the browser, so it works in Expo Go with no native SDK.
2. **When the user finishes.** Plaid sends `LINK / SESSION_FINISHED` to `bank-webhook` with the public
   token. The server exchanges it, encrypts the access token, saves the account names and last fours,
   and runs the first sync. Meanwhile the app polls `status` and refreshes.
3. **New transactions.** Plaid sends `TRANSACTIONS / SYNC_UPDATES_AVAILABLE`. The server pulls every page
   since its cursor and restarts from the same cursor if the data changes mid-way, as Plaid asks.
4. **How each transaction is handled:**
   - **Skipped (not purchases):** money in, transfers, loan and card payments, bank fees, and investment
     accounts.
   - **Merged into an emailed receipt:** when the store's emailed receipt or the bank's emailed alert
     already has the same purchase (same amount, within 2 days, similar store), it's merged into that row
     and never counted twice.
   - **Pending, then settled:** a pending charge that settles under a new id updates the same row.
   - **Removed at the bank:** the receipt is dropped, unless an email also described it.
5. **When the bank needs attention:**
   - `ITEM_LOGIN_REQUIRED` or a pending expiry: the connection shows **Sign in again**.
   - Access revoked at the bank: the token is deleted immediately.
6. **Disconnect.** It calls Plaid's `/item/remove`, then deletes the connection, token and accounts. Purchases
   already brought in stay.

## Your rules, and how they're kept

| Rule | How |
|---|---|
| Never store full card numbers | Only the account's last four digits (mask), and only if they're exactly four digits. The database refuses anything longer. No raw bank data is stored, only store, amount, date, last four, pending flag and kind of purchase. |
| Secrets in env vars only | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `BANK_TOKEN_KEY`. Access tokens are **encrypted** (AES-256-GCM) with `BANK_TOKEN_KEY` before they're stored, and the database refuses unencrypted ones. `bank_secrets` has no user access at all. |
| Verify every inbound webhook | `bank-webhook` refuses anything without a valid Plaid ES256 signature, from Plaid's own key: older than 5 minutes, or whose body hash doesn't match. Tested with forged, stale and altered requests. |
| RLS on every table | Users can read their own connections (not the sync cursor) and their own accounts' names and last fours. Tokens and link sessions are service-only. Connections can only be made by the server. pgTAP test `27_bank` (8 checks). |
| Informs, never acts | Read-only: PerkScan can't move money. It reads transactions only. |

The data export now includes bank connections and accounts. Deleting your account removes everything,
through the cascade.

## What you need to do

### 1. Plaid account

Sign up at dashboard.plaid.com. Sandbox is free. Production needs Plaid's approval (their application and
security questionnaire). Check Plaid's current pricing for Transactions before launch; it's billed per
connected account, and I couldn't confirm today's rate from here.

### 2. Secrets

Make a key once with `openssl rand -base64 32`, then:

```bash
npx supabase secrets set PLAID_CLIENT_ID=… PLAID_SECRET=… PLAID_ENV=sandbox BANK_TOKEN_KEY=<that key>
```

Keep `BANK_TOKEN_KEY` safe. Losing it means every connected user has to connect again.

### 3. Ship

```bash
git pull
npx supabase db push                                 # migration 000033
npx supabase functions deploy bank bank-webhook      # bank-webhook has verify_jwt = false in config.toml
npx expo start --tunnel -c
```

### 4. Try it in Sandbox

Settings → Bank → Connect a bank. Pick any bank and sign in with Plaid's test user `user_good` /
`pass_good`. Sandbox purchases appear within a minute.

## Tests

| Suite | Result |
|---|---|
| Jest | 576 pass, including 5 new tests: what counts as a purchase, last four only, merchant names, kinds of purchase |
| End-to-end (`bank_e2e`), local database, fake Plaid signing with a real ES256 key | Forged, stale and altered webhooks refused. Connect via `SESSION_FINISHED`. Token stored encrypted. Purchases in, transfer skipped. Chipotle merged into its emailed receipt. Uber Eats matched to the card ending 6042. Pending Starbucks settled into one row. Re-sync adds nothing. Someone else can't disconnect it. Disconnect calls Plaid and deletes the token. Revocation deletes the token. |
| All end-to-end suites | 15 pass |
| pgTAP | All pass (291) |
| Browser | Bank screen with a connection: status, account ·· 6042, Update now, Disconnect |

## Not proven yet

- It hasn't talked to the real Plaid: this session can't reach it, so everything ran against a fake that
  follows Plaid's documented API.
- The first Sandbox connection on your side is the real test. If anything fails, the function logs Plaid's
  error code (never the keys).
