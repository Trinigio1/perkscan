# PerkScan

Finds money you're already owed and shows it as one number: **"You left $X on the table this year."**

Expo (React Native) + TypeScript + Expo Router on the front end, Supabase (Postgres, Auth, RLS) on the back end.
The earlier Firebase prototype lives untouched in `legacy/` for reference.

- What's built so far and how to test it: [`PHASE_1_NOTES.md`](PHASE_1_NOTES.md), [`PHASE_2_NOTES.md`](PHASE_2_NOTES.md), [`PHASE_3_NOTES.md`](PHASE_3_NOTES.md), [`PHASE_4_NOTES.md`](PHASE_4_NOTES.md)
- Connect Gmail: [`gmail/README.md`](gmail/README.md)
- Card benefits (edit + verify these): [`seed/card_benefits.json`](seed/card_benefits.json)

## Project layout

```
src/app/            Screens (Expo Router). (auth), (onboarding), (tabs), card/, credit/
src/components/     UI kit, card picker/forms, disclaimer
src/domain/         Pure logic + unit tests: score, worth-it, reminders, seed validation
src/lib/            Supabase client, auth, data loading, notifications
src/theme/          Colors (light/dark) and spacing
supabase/migrations Schema, RLS, period math, credit sync, cron jobs
supabase/tests/     pgTAP database tests + two-user RLS check through the API
supabase/templates/ Sign-in email templates (include the 6-digit code)
seed/               card_benefits.json — the only place benefit values come from
scripts/            build-seed.ts (validates the JSON, writes supabase/seed.sql)
```

## Setup on Windows (free tools only)

1. Install **Node.js 22 LTS** and **Git**. For Android testing, install **Android Studio** and create an emulator
   (Device Manager → Create device). For iPhone testing, install **Expo Go** from the App Store.
2. Clone and install:
   ```powershell
   git clone https://github.com/Trinigio1/perkscan.git
   cd perkscan
   git checkout phase-1
   npm install
   ```
3. Create a free Supabase project at https://supabase.com, then link and push the database:
   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --include-seed
   ```
4. In the Supabase dashboard:
   - **Authentication → Sign In / Providers → Email**: enabled; email OTP length **6**.
   - **Authentication → Emails → Templates**: paste `supabase/templates/magic_link.html` into *Magic Link* and
     `supabase/templates/confirmation.html` into *Confirm signup*. Without this, emails contain only a link, not the code.
   - **Authentication → URL Configuration → Redirect URLs**: add `perkscan://**` and `exp://**`.
   - Google (optional): create an OAuth client of type *Web application* in Google Cloud Console with redirect URI
     `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`, then paste its client ID and secret into
     **Authentication → Sign In / Providers → Google**.
5. Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   (Project Settings → API Keys).
6. Run it:
   ```powershell
   npx expo start
   ```
   Scan the QR code with Expo Go (iPhone camera / Expo Go on Android), press `a` for the Android emulator, or `w`
   for a browser preview.

## Everyday commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests (score, worth-it, reminders, seed validation, card form) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run seed:build` | Validate `seed/card_benefits.json` and regenerate `supabase/seed.sql` |
| `npx supabase db push --include-seed` | Apply new migrations and seed to your linked project |
| `npm run test:db` | pgTAP tests against a database with the migrations applied (`npx supabase test db` also works) |
| `npm run test:inbox` | End-to-end inbox test with a fake model (needs Deno and the same env vars as `test:rls`) |
| `npm run test:rls` | Two-user RLS check through the API (needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) |

## Updating card benefits

1. Open the issuer's benefits page and check one benefit.
2. In `seed/card_benefits.json`, set `amount` (per period), `status: "active"`, `last_verified: "YYYY-MM-DD"` and
   `source_url` (the exact page you checked).
3. `npm run seed:build`. It refuses to build if a verified benefit is missing its amount, date or source.
4. `npx supabase db push --include-seed`. The hourly sync updates everyone's credits, including ones already marked used.

Unverified amounts (`null`) always count as $0, so the app can undercount but never inflate.
