# Deals: hidden value you already have, learning what you like, and where codes work

## Where a code works
- The reader records `valid_at` (named restaurants/stores, a kind of store, or "Participating restaurants")
  and `first_order_only` for each offer (prompt 2026-11-12; columns in migration `20261102000027`).
- Rows show it before you try the code ("Only at ALDI · first order only"); the offer's page too.
- A delivery app's code whose email doesn't say where (Uber Eats, DoorDash, Grubhub, Instacart…) gets a
  heads-up on its page: the email doesn't say which restaurants, check the offer's terms in the app.
- Existing codes get this once re-read (`rereadAll`); new emails get it automatically.

## Deals → "Already yours"
- Perks you have access to without an email, ranked for you, each with why, Get it / I have it / Not for me:
  birthday and loyalty rewards at stores you use (Sephora, Ulta, Chipotle, Panera, Dunkin', AMC, CVS,
  Target Circle), issuer perks for banks you hold cards from (Bank of America Museums on Us, Amex/Chase/
  Capital One/Citi offers), free national programs (NPS fee-free days, IRS Free File), your cards' and
  memberships' own perks, and a link to your student perks.
- These 15 programs were verified on their official pages on 2026-10-25 (the earlier "Perks for you"
  research); they're back in the catalog (migration `…028_catalog_data`), shown inside Deals only. Home is unchanged.
- Each interest filter also shows its perks.

## Learning what you like (`taste.ts`)
- Saved deals +1, hidden deals −1, offers you used +2, "I have it" +1, "Not for me" −1, per interest.
- Liked interests raise matching deals ("Like fitness deals you saved or used") and perks; disliked ones
  lower them. Deals shows "Learned from what you save and use: …".

## Not done here (no network in this session)
More hidden-value programs need official sources: Bank of America BankAmeriDeals, Miami-Dade library
perks (museum passes, Kanopy), University of Miami student perks, Uber One/Prime partner perks. Add to
`seed/programs.json` as `free_perk` with source_url + last_verified, then `npm run seed:build -- --migration`.

## Ship
1. `npx supabase db push`
2. `npx supabase functions deploy ingest process-inbox`
3. On your computer: `git pull origin phase-1`, then `npx expo start --tunnel -c`
4. Optional: `rereadAll` in the Gmail script, so existing codes learn where they work.
