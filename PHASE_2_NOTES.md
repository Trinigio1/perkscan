# Phase 2: Inbox + AI parsing

PerkScan now reads receipts and promo emails and turns them into offers: promo codes, gift cards, store credit,
points, free trials, return windows and settlements. While you're the only tester it costs **$0** apart from Claude
API usage, because emails arrive from **your own Gmail through a small Google Apps Script**, not a paid email
service.

## What was built

**How an email flows**
```
Gmail (label "PerkScan") → Apps Script every 10 min → ingest Edge Function → clean → Claude Haiku 5.5 → rows
                                                        (token check, dedupe)   (JSON schema + Zod, retry once)
```

- **Gmail script** (`gmail/PerkScan.gs` + `gmail/README.md`)
  - Sends only emails you label `PerkScan`, newer than 60 days, in batches of up to 10.
  - Takes whole threads only, so nothing is skipped.
  - Marks what it sent with the label `PerkScan-sent`.
  - Includes `testPerkScan` and `installPerkScanTrigger`, plus a suggested Gmail filter.
- **`ingest` function**
  - Accepts `Authorization: Bearer psk_…` (a personal token from the app; only its SHA-256 hash is stored).
  - Validates the request body.
  - Allows 200 emails per user per hour.
  - Ignores emails it has already seen (by Gmail message id).
  - Stores only the *cleaned* text, then reads it in the background.
- **Email cleaning**
  - Strips HTML, styles, tracking pixels, footers and signatures.
  - Replaces links with their domain.
  - Masks full card numbers (checksum + card prefix, and never order or tracking numbers).
  - Keeps only the sender's domain and caps length at 12k characters.
- **Parsing** with `claude-haiku-5-5`
  - Uses structured JSON output with the Zod schema and low effort (it's extraction, not reasoning).
  - Our own Zod validation runs after, with one retry on invalid output.
  - A refusal or failure marks the email `failed`.
  - The prompt treats the email as untrusted data (it ignores any instructions inside it).
- **Turning results into rows**
  - Expired or valueless offers are skipped, and duplicates merge by a dedupe key.
  - Receipts match your card by last 4 digits.
  - Return windows come from "30 days" or explicit dates.
  - Free trials and return windows never get a dollar value, so they can't inflate "left on the table".
- **Privacy**
  - Raw text is deleted right after a successful parse, and within 24 hours at most.
  - Subjects and full sender addresses are never stored.
- **Monthly AI budget cap**
  - `AI_MONTHLY_BUDGET_USD`, default $2.
  - Every parse records its token use and cost in `ai_usage`.
  - When the cap is reached, emails wait until next month.
- **`process-inbox` function** (needs a signed-in session): **Retry** for failed emails, and **Send a test email**.

**App**
- **Offers tab:**
  - **Expiring this week** first.
  - Then promo codes, gift cards and store credit, points, trials and returns, and settlements.
  - **History** for used, dismissed and expired offers.
- **Offer screen:**
  - Tap-to-copy code, "use by" countdown and steps.
  - **I used it** records the money saved (or asks how much), and **Not interested** dismisses the offer.
  - **Undo** reverses either.
- **Connect Gmail:**
  - Create a token (shown once) and copy the URL.
  - Setup guide link, test button, and the list of active tokens with revoke.
- **Inbox:** every email PerkScan has read, what it found, and failures with **Try again**.
- **Home:** gift cards, promos, points, returns and trials and settlements appear once something has been found.
  "Expiring soon" mixes credits and offers.
- **Reminders** now cover offers too, e.g. "Your Northwind code expires in a week" or "StreamFlix trial ends in 2 days".

**Database** (`20261021000001_inbox.sql`)
- **Tokens:** `create_ingest_token`, `revoke_ingest_token` and `resolve_ingest_token` (server only).
- **Offers:** `mark_opportunity`.
- **Bookkeeping:** forwarding ids `u_xxxxxxxxxx` for every user (ready for a future domain), an `ai_usage` table,
  and dedupe indexes.

## How it was verified

| Check | Result |
|---|---|
| `npm test`: cleaning, parsing and retry, offer rules, reminders, score… | **95/95 pass** |
| `npm run test:db`: pgTAP incl. tokens, dedupe, `mark_opportunity`, other users blocked | **77/77 pass** |
| `npm run test:inbox`: real `ingest`/`process-inbox` handlers against a running Supabase, **fake model** | **pass** |
| `npm run test:rls`: two users through the API | **20/20 pass** |
| `deno check` on both functions, `tsc`, `expo lint`, iOS and Android bundles | clean |
| `gmail/PerkScan.gs` run against fake Gmail and a locally served `ingest` | 13 emails in 2 batches, whole threads only, HTML fallback, all parsed |
| Browser walkthrough: create token → test email → offers → copy code → inbox → home | works, no console errors |

The end-to-end test checks:
- **Security:** wrong and revoked tokens are rejected (401), and a second user sees nothing.
- **Duplicates:** re-sent emails are ignored.
- **Privacy:** the full card number never reaches the model, and raw text is deleted after parsing.
- **Results:** receipts are matched to the right card.
- **Failures:** retry after invalid output works.
- **Budget:** the cap holds.

**Not tested: the real Claude API.** There's no API key in my environment, so the backend was checked with a fake
model. **Your first real emails are the real test of the parsing quality.** If something is misread, send me the
summary from the Inbox screen (no personal details needed) and I'll tune the prompt.

## Your setup (Windows, VS Code terminal)

```powershell
git pull
npm install
npx supabase link --project-ref gczxfvbrhnlaanjidfmy   # if you haven't linked yet
npx supabase db push                                   # adds the Phase 2 tables and functions
```

**1. Store the Claude key as a Supabase secret.** Typing it straight into the terminal would save it in your
PowerShell history, so use a temporary file instead:
1. In VS Code, create `supabase/functions/.env` (git already ignores `.env` files) containing:
   ```
   ANTHROPIC_API_KEY=sk-ant-...your key...
   AI_MONTHLY_BUDGET_USD=2
   ```
2. Run:
   ```powershell
   npx supabase secrets set --env-file supabase/functions/.env
   ```
3. **Delete** `supabase/functions/.env`.

**2. Deploy the two functions:**
```powershell
npx supabase functions deploy ingest --no-verify-jwt --use-api
npx supabase functions deploy process-inbox --use-api
```
`--use-api` bundles them on Supabase's side, so you don't need Docker. `ingest` uses `--no-verify-jwt` because the
Gmail script signs in with your PerkScan token instead.

**3. Check in the app:** `npx expo start --clear` → **Settings → Connect Gmail** → **Create token** →
**Send a test email**. A "$10 off" test coupon should appear under **Offers**.

**4. Gmail:** follow `gmail/README.md` on a computer, which takes about 5 minutes, then label a few real receipts
and promo emails `PerkScan`.

## Test checklist
1. [ ] **Send a test email** in Connect Gmail → toast "It works" → a test coupon appears in Offers.
2. [ ] In Apps Script, **testPerkScan** logs "It works!" and a GMAILTEST10 coupon shows up.
3. [ ] Label a real receipt `PerkScan` → within ~10 min it's in **Inbox** as a receipt. If it shows the last 4 digits
       of a card in your wallet, it's matched to that card.
4. [ ] Label a promo email with a code → it appears in **Offers** with the code, and tapping the code copies it.
5. [ ] **I used it** → it moves to History, and Recovered on Home goes up. **Undo** reverses it.
6. [ ] Label the same email again → no duplicate offer.
7. [ ] Revoke the token in the app → the next Apps Script run logs "PerkScan rejected the token".
8. [ ] A second account sees none of your emails or offers.

## Keys and settings

| Name | Where | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Supabase secret | Never in the app or the repo |
| `AI_MONTHLY_BUDGET_USD` | Supabase secret | Optional, defaults to 2 |
| `PERKSCAN_URL`, `PERKSCAN_TOKEN` | Inside your Apps Script only | From Connect Gmail |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Set by Supabase automatically for functions | — |

## Known gaps and decisions
- **No forwarding address yet:** forwarding through Cloudflare needs a domain (~$10/yr). Each user already has a
  forwarding id, and the backend is the same; we'd add a Cloudflare Email Worker that signs requests to `ingest`.
  Gmail's forwarding-confirmation email handling comes with it.
- **The budget cap is shared across all accounts.** That's right for a key only you pay for, but needs revisiting
  before other people use it.
- **Points have no dollar value** unless the email states one, and **trials and return windows never count as money**.
- **Original text isn't kept:** an email that keeps failing is given up after 3 tries, and its text is deleted
  within 24 hours either way.
- **Items are kept:** receipts store item names and prices. They're structured fields, needed for Phase 3
  (warranty and purchase-protection matching).
- **Gmail checks every 10 minutes,** the most often Apps Script allows on its free tier.
- **Phase 4 (texts)** will reuse `ingest` with `source: "sms"`. The `ingest_tokens` table is already shared.
