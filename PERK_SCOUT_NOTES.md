# Perk scout (pillar 3 of 6): hidden value for every user, automatically

Until now, free perks (birthday rewards, free-to-join programs) only existed if I'd researched them by
hand. Now the hourly scout finds them on its own for the stores PerkScan users actually buy from.

## How it works

1. **What's missing.** `_perk_store_candidates` lists stores bought from in the last year, per country, that
   no catalog program covers. "chipotle" counts as covering "Chipotle Mexican Grill". It only ever returns
   counts of people, never who.
2. **Privacy rule.** A store only one person buys from is never looked up, unless it's a well-known chain
   (the existing official-site list). Otherwise an obscure store in the shared catalog could point at that
   one person.
3. **Find the page.** For each candidate it finds the store's rewards page on its own site: first the sitemap
   the site publishes, then /rewards, /loyalty, /perks, /membership. robots.txt is respected, https only,
   same site only. This reuses the deal scout's page finder, now generalized.
4. **Read it.** One small AI call returns the program and its perks, each with a word-for-word quote. Then
   `check.ts` applies the gates:
   - it is free to join, in the page's own words
   - its name is on the page
   - every perk's quote is really on the page
   - every number in a headline is in its quote
   - paid programs are dropped
5. **Publish or hold.**
   - **No dollar amounts** ("free birthday side"): published straight into `perk_programs` as `free_perk`,
     `origin = 'scout'`, with the quotes. It then appears in **Perks for you** for everyone who shops
     there. Expanding it shows "Found by PerkScan on sweetgreen.com: '…'".
   - **States a dollar amount** ("$5 off when you join"): held in `perk_candidates` until you approve it.
     This follows "never invent benefit amounts": a quote can be right and still be read wrong.
6. **Monthly re-check.** Each scouted program is re-read every 30 days. If its page no longer backs it up,
   or it now states an amount, it's hidden.
7. **Each store at most monthly.** Every lookup result is kept in `perk_store_checks`, so a store is read at
   most once a month.

## Your part: reviewing held perks

```bash
SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service key> npm run perks:review
#   lists what's waiting, with the page link and the quotes
… npm run perks:review -- --approve scout_us_wingstop
… npm run perks:review -- --reject scout_us_wingstop
… npm run perks:review -- --gaps    # what the catalog is missing: stores and cards, counts only (2+ people)
```

Open the link and check the quote before approving. The service role key stays on your computer; never put
it in the app.

## Cost

- **AI per store:** about 8k input tokens of page text plus a short reply, roughly **$0.001** at Haiku
  prices. Finding the page costs nothing (plain page reads).
- **Volume:** 3 stores per hourly run at most.
- **Cap:** it shares the scout's monthly cap (`SCOUT_MONTHLY_BUDGET_USD`, default $3) and stops when that's
  reached.

## Security and privacy

| Thing | Who can reach it |
|---|---|
| `perk_candidates`, `perk_store_checks` | RLS on, with no user policies: service role only |
| `_perk_store_candidates`, `review_perk_candidate` | Service role only |
| `perk_coverage_gaps` view | Service role only, and only items 2+ people have |

A pgTAP test proves users can't read the held perks, the store checks or the candidate list, and can't
approve anything.

## Tests

| Suite | Result |
|---|---|
| Jest | 564 pass, including 6 new tests of the gates and the rewards-page picker |
| pgTAP | New `25_perk_scout` (6 checks), plus the rest: 280 pass |
| End-to-end (`perkscout_e2e`), against the local database with a fake site and model | Sweetgreen published with its quote. Wingstop's "$5 off" held, then published once approved. A one-person boutique never looked up. Nothing re-read the same day. A program whose page vanished is hidden on re-check. |

## Not proven yet

- This session can't reach real store sites, so the page finding and reading have only run against fake
  pages.
- Some chains render their rewards page with JavaScript. Those come back as "page has no readable text",
  are recorded in `perk_store_checks`, and are retried in 30 days.
- The scout's response now includes `perks: [...]`, which shows each store's result. Look at it after a day.

## To ship

```bash
git pull
npx supabase db push                       # migration 000031
npx supabase functions deploy scout
npx expo start --tunnel -c
```
