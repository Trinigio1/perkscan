# Card & membership perks in the total; less to check

## Perks with a value
- `card_benefits` gains `worth`, `worth_period` ('year' | 'use'), `worth_basis`, `worth_source_url`
  (migration `20261102000024`). A worth is only allowed on a verified benefit with the provider's own
  source (seed schema and a DB check enforce it). Never invented.
- Set so far: Grubhub+ with Prime, $120 a year, Amazon's own figure (aboutamazon.com).
- "When you need it" (Money) shows the value next to each perk ("≈ $120/yr", "up to $100") with its basis,
  and now also lists card access perks (lounges, DashPass, status, free checked bags, free nights).
- Home adds "≈ $X in card & membership perks" to "Save up to": one-time credits up to their amount
  (Global Entry) plus yearly worths. Per-use worths (a bag fee per flight) show on the perk but aren't summed.

### Waiting on network access
Official price pages for lounges (prioritypass.com), DashPass (doordash.com), Global Entry (cbp.gov) and
airline bag fees (delta.com, united.com) couldn't be reached from the build environment. Once those
domains are allowed, add `worth` to those perks in `seed/*.json`, then `npm run seed:build -- --migration`.

## Less to check
- Not perks, never shown: card applications ("Apply for … card"), interviews and surveys, discounts for
  signing up to texts or emails. Reader rule (prompt 2026-11-10) + `notAPerk`, and migration
  `20261102000025` dismisses saved ones.
- Vague offers (no code, no amount) from stores you don't use and that aren't your interests are hidden
  (`isVagueElsewhere`). From your own stores they stay, to check.
- "N more to check" counts stores, like Money's rows (21 Uber Eats offers are one).

## Ship
1. `npx supabase db push`
2. `npx supabase functions deploy ingest process-inbox`
3. On your computer: `git pull origin phase-1`, then `npx expo start --tunnel -c` and reopen the app.
