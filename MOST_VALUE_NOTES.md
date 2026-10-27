# Most value first: Save up to, your stores first, one row per store, no stale codes

## Home: "Save up to"
The headline is everything you could save. Each part has its own line under it, so it's clear what's
sure and what's an estimate:
- **ready to use now**: confirmed money (card credits, codes and credit with a stated value)
- **≈ off at stores you use**: percent codes at stores on your receipts, worth your usual order there
- **≈ in deals for you**: matched public deals
- **a year with student prices**: subscriptions you pay full price for, with checked student prices
Student perks (a count) and "N more to check before they count" are shown but never added. Currencies are never converted.

## Money
- **Stores you use first** (`src/domain/relevance.ts`): your receipts' stores, your memberships and your
  cards, then your interests, then everything else. Within that, the same order as before (deadline,
  confidence, amount), and a bigger percent off ranks above a smaller one.
- **One row per store**: a store's codes fold under its best one ("5 more codes from Funded Trading Plus").
  Grouped by store name, not the sending domain (one sender can email codes for several stores).
  Card credits, gift cards and the rest never fold. "Use soon" on Home shows one thing per store.
- **Old codes retire**: a code with no end date is dropped 30 days after its email was sent (the email's
  date, not when it was saved, so a re-read doesn't revive it). Not counted as missed. Gift cards, store
  credit, card credits, items added by hand or acted on are never retired.

## Honest totals
- Prices ("tickets for $59") and referral rewards ("give $20, get $20", "spread the love") get no amount:
  reader rule (prompt 2026-11-09) and code check (`isPrice`, `earnedByDoing`), plus migration
  `20261102000023` for ones already saved. They stay listed, just not as money.

## Ship
1. `npx supabase db push`
2. `npx supabase functions deploy ingest process-inbox`
