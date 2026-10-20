# Phase 1: Foundation + card perks

## What was built

**App (Expo SDK 58, Expo Router, TypeScript)**
- **Sign-in:** a 6-digit email code (the magic link in the same email also works), plus Google through the system
  browser, which works in Expo Go with no native SDK. Sign in with Apple is written but switched off with
  `EXPO_PUBLIC_ENABLE_APPLE_SIGNIN=false` until there is a paid Apple Developer account.
- **Onboarding:** pick cards from the catalog → last 4 digits, optional open date, nickname → student toggle and
  reminder opt-in.
- **Home:**
  - The big "You left $X on the table in <year>" number.
  - "At risk this week" and "Recovered this year" tiles.
  - A list of credits expiring soon.
  - A breakdown by category. Only card credits are live; the other categories say "Coming soon".
- **Credits tab:** each card's credits for the current period, plus *Missed* and *Used* filters. Each credit shows
  progress, "use by" and reset dates, and an enrollment badge.
- **Credit screen:** mark used in full, mark partly used (enter an amount), or reset to unused. Also shows
  how-to steps, terms, verification status and the disclaimer.
- **Wallet:** your cards. Tapping one shows all its credits, protections and perks with verification status and
  links to the issuer's terms, and lets you edit or remove the card.
- **"Worth the fee?":**
  - Annual fee vs. verified credit value, with a usage selector per credit (0–100%). Each selector starts from
    your real history on that card.
  - A verdict, the break-even usage, and what you've used so far this year.
  - It is conservative on purpose: points and perks aren't counted.
- **Settings:** student toggle, reminders toggle, how many benefits are verified, the full disclaimer, a privacy
  summary, and sign out.
- **Reminders:** local notifications 7 days and 2 days before an unused credit resets, at 10:00 local time.
  They're rescheduled every time data refreshes, capped at 50 because of iOS limits.
- **Dark mode:** follows the phone's setting.
- **Missing configuration:** if `.env` is missing, the app shows a friendly "Almost there" screen instead of
  crashing.

**Database (Supabase)**
- All tables from the brief, plus these additions:
  - `card_benefits`: `period_anchor`, `amount_schedule`, `enrollment_required`, `merchant_match`, `status`, `notes`
  - `opportunities`: `category` (computed from `type`), `user_card_id`, `benefit_id`, `period_start`
  - `benefit_usage`: `is_used`
  - `profiles`: `timezone`, `onboarded_at`
  - tables for later phases (`settlements`, `student_discounts`, `user_student_claims`, `ingest_tokens`), so the
    schema is ready
- **RLS on every table.**
  - Catalog tables are read-only for signed-in users.
  - Usage, recovered money, receipts and messages are read-only for users. They change only through server
    functions.
  - `forwarding_address` and SMS token hashes can't be edited or read from the app.
  - Signed-out requests see nothing.
- **Period math** (`benefit_period_bounds`):
  - Calendar periods (month, quarter, half-year, year).
  - Card-anniversary periods. Month-end dates and leap days are handled, and dates don't drift over time.
  - If the open date is missing, it falls back to calendar periods.
- **Credit sync** (`_sync_card_credits_for_user`):
  - Creates one opportunity per card × credit × period, starting from the day the card was added.
  - Refreshes amounts from the catalog.
  - Expires anything past its deadline.
  - Runs hourly through pg_cron, every time the app opens, and whenever a card is added or edited.
- **`mark_credit_used` RPC:** updates usage, recovered money and status together in one transaction.
  - A credit marked "used in full" while its amount was unverified picks up the amount automatically once you
    verify it.
- **Privacy job:** raw email/SMS bodies are cleared after 24 hours, every hour. This matters from Phase 2 on.

**Seed data**
- `seed/card_benefits.json` has 10 cards and 76 benefits.
  - **Every amount and annual fee is `null` with status `TODO_VERIFY`.**
  - Benefit names and reset periods come from issuer pages and 2025–26 coverage. Verify them too.
  - Items I couldn't confirm after the 2025 refreshes (Amex Saks and Walmart+ credits) say so in `notes`.
  - I left out the rumoured Amex Uber One credit.
- `npm run seed:build` validates the file and generates `supabase/seed.sql`.
  - It refuses to build if a benefit is marked verified without an amount, source URL and date.
  - It refuses to build if any amount is set on a benefit still marked unverified.

## How it was verified (in my cloud environment)

| Check | Result |
|---|---|
| `npm test`: score, worth-it, reminders, formatting, seed rules, card form | **51/51 pass** |
| `npm run test:db`: pgTAP for period math, RLS, sync, mark-used, expiry | **57/57 pass** |
| `npm run test:rls`: two real signed-in users through Supabase Auth + REST | **20/20 pass** |
| `tsc --noEmit`, `expo lint` | clean |
| `expo export` for iOS and Android | both bundles build |
| `expo-doctor` | 18/20. The 2 failures need Expo's online API, which my environment blocks |
| Browser walkthrough (web build, headless Chromium, phone-sized) | sign-in with a real emailed code → onboarding → home → credits → mark partly / fully used → wallet → worth-it → card → settings, in light and dark, with **no console errors** |

To check the numbers in the walkthrough I loaded *test-only* amounts into my local database (never into the seed
file). With three months of history, Home showed $235 left on the table and $445 available, which matches the
hand calculation. After marking $40 + $15 used, Recovered showed $55 and available dropped to $390.

**I could not run the iOS simulator or Android emulator here.** There's no macOS, and the cloud machine has no
hardware virtualization. Please run the checklist below on a device or emulator.

## Your test checklist

**Setup:** follow README "Setup on Windows" steps 1–6.

**Env keys to add to `.env`**

| Key | Where to find it |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys (publishable, or the legacy *anon* key) |
| `EXPO_PUBLIC_ENABLE_APPLE_SIGNIN` | Leave `false` for now |
| `SUPABASE_SERVICE_ROLE_KEY` | Only to run `npm run test:rls` on your computer. Never put it in the app or prefix it with `EXPO_PUBLIC_` |

Google sign-in also needs the Google client ID and secret pasted into the Supabase dashboard (not into `.env`).

**On a phone (Expo Go) or the Android emulator**
1. [ ] App opens on the sign-in screen (not "Page not found").
2. [ ] Enter your email → the email shows a **6-digit code** (if not, the template step was skipped) → code signs you in.
3. [ ] Pick 2 cards → leaving last-4 empty shows an error → enter 4 digits → typing letters is blocked → a
       future/invalid open date is rejected.
4. [ ] Finish → allow notifications → Home appears showing **$0** and the "credits don't have a verified amount"
       banner. That's correct until you verify amounts.
5. [ ] Verify one credit in `seed/card_benefits.json` (e.g. a monthly credit) → `npm run seed:build` →
       `npx supabase db push --include-seed` → pull to refresh: its amount appears.
6. [ ] Credits tab → open that credit → "I used part of it" ($5) → progress bar moves, Recovered goes up →
       "I used all of it" → shows *Used* → "Mark as not used" resets it.
7. [ ] Wallet → card → Edit → change the open date → anniversary credits show new reset dates.
8. [ ] Worth the fee? → with the annual fee verified, change the usage selectors → verdict and net update.
9. [ ] Settings → toggle student and reminders → sign out → sign back in → your data is still there.
10. [ ] Phone in dark mode → every screen is readable.
11. [ ] **RLS with a second user:** sign in with a second email on another device or after signing out. You see
        none of the first user's cards. Or run `npm run test:rls` with your service role key.
12. [ ] Google sign-in (if configured): the browser opens, you pick an account, and you're sent back to the app signed in.

## Known gaps and decisions to review

- **Nothing before a card was added counts.** We don't know whether earlier credits were used, so the score only
  counts periods from the day the card was added. The headline is "since you added your cards", not a reconstruction of the full year.
- **Recovered = credits you marked used.** Using a $15 Uber credit counts as $15 recovered. Say if you'd rather
  keep Recovered for later phases only (claims, refunds).
- **The credit sync runs hourly, not nightly.** Periods end at each user's local midnight, so hourly sync catches
  every time zone. The app also syncs whenever it opens.
- **A new category, "Returns & trials",** holds `return_window`, `price_drop` and `free_trial`, which didn't fit the
  brief's seven categories.
- **Protections and perks are shown on the card screen but don't create opportunities yet.** That's Phase 3
  (receipt matching).
- **Reminders are local notifications only.** Server-sent weekly push is Phase 6.
- **Delete-my-data and export are Phase 6.** Settings says so.
- **Supabase's built-in email sender is for testing.** It has strict rate limits and may only deliver to your own
  team's addresses. Set up custom SMTP (for example Resend's free tier) before anyone else tests.
- **The magic link in Expo Go** opens an `exp://` address tied to your dev server, so the code is the reliable path
  during development.
- **The web build is for previews only.** Reminders are off on web.
- **The seed builder adds and updates, but never deletes.** If you delete a benefit from the JSON, also delete it in
  the Supabase table editor. Deleting it removes users' history for it.
- **`legacy/` (old Firebase prototype)** is kept for reference. It includes a committed `google-services.json`, and
  the repo is public. Firebase client keys aren't secret, but if that Firebase project is unused, consider deleting
  it or restricting its API key.
- **Bundle ID / package:** `com.perkscan.app`, the same as the prototype.
