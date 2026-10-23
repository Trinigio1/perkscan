# Deals for you

Store deals near you, matched to what you're into, kept up to date automatically with no human approval step.

## Where deals come from

1. **Official pages (the scout).** `seed/deal_sources.json` lists official pages: store promotion pages, bank and card-network promotion pages, and government pages. The `scout` Edge Function reads a few of them every hour, so each page is re-read about once a day.
   - Store items become **deals**.
   - Bank and government items become **Coming up near you** events, shown only to people holding that bank's cards (or any card of that network, e.g. Mastercard).
2. **Public codes from email (opt-in).**
   - With **Settings → Share public codes** on, the email reader records the store, offer, code, dates and country of promo codes.
   - Every hour, a code that at least **3 different opted-in people** received is published as a **Likely** deal, without saying who received it.
   - Codes meant for one person never qualify: birthday, referral and gift-card codes are skipped up front, and the threshold catches the rest.
   - Turning sharing off deletes that person's records within the hour.
3. **Affiliate feeds**: `deals.source` already allows `affiliate`. Once a network (CJ, Rakuten, Impact, Awin) approves PerkScan, add an adapter that upserts into `deals`. US law (FTC) requires disclosing affiliate links, and ranking must stay "best for the user", never "best commission".

## How the scout decides without a human

Every item the model extracts must pass these checks (`_shared/scout/validate.ts`, unit-tested):

- **Evidence:** the quoted evidence appears word for word on the page. Otherwise the item is dropped.
- **Headline numbers:** every number in the headline appears in that quote. Otherwise the item is dropped, so amounts can't be invented.
- **Details:** each amount, percentage, minimum spend, code and date must be found on the page. Any that aren't are removed; the item stays.
- **Dates:** already ended → dropped. Starts more than 180 days out → dropped. Implausible dates are removed.
- **Something concrete:** a stated amount, percentage or code is shown as **Confirmed**. "Free…" or "cash back" with no number is shown as **Check**. Vague marketing is dropped.
- **Bank and government items need a stated end date.**
- **Links:** they only point to the store's own site.

The page reader also obeys robots.txt, reads https only, refuses redirects to other sites, and caps size and time.

**Keeping it current:**
- An item that disappears from its page is taken down after 2 days.
- Ended deals are purged daily.
- If 3 different people tap **Didn't work?**, the deal is hidden for everyone.
- Pages that keep failing are retried weekly. Their error is in `deal_sources.last_status`.

## Matching (`src/domain/deals.ts`, unit-tested)

**Ranking order:** a store you use (+40), an interest you picked (+25), what your receipts show you spend on (up to +15). Then value, ending soon, confidence and how many people saved it.

**Feedback:** "Not for me" hides that deal and lowers others from the same store. Saving one creates a reminder in Money with its code and confidence.

**Where it shows:**
- **Home → Deals for you:** the top 3.
- **Deals for you screen:** "For you", then "More near you".
- **Interests:** a chip picker in onboarding step 4, plus Settings → Interests, which also holds the US state.

## Setup on the live project

1. `npx supabase db push`. This creates the tables and jobs and loads the 13 sources.
2. Deploy the scout and the updated email reader:
   ```
   npx supabase functions deploy scout --no-verify-jwt
   npx supabase functions deploy ingest
   npx supabase functions deploy process-inbox
   ```
3. Make a long random secret (e.g. `openssl rand -hex 32`). Put `SCOUT_SECRET=<it>` (and optionally `SCOUT_MONTHLY_BUDGET_USD=3`) in `supabase/functions/.env`, then run `npx supabase secrets set --env-file supabase/functions/.env` and delete the file.
4. In the SQL editor, run once:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/scout', 'scout_url');
   select vault.create_secret('<the same SCOUT_SECRET>', 'scout_secret');
   ```
   Without these the hourly job does nothing.
5. Optional, to see it run now: `curl -X POST <scout_url> -H "Authorization: Bearer <secret>" -d '{"only":["pricesmart_tt"]}'`
6. After a day, check `select id, last_status, last_found from deal_sources order by id;` and fix or deactivate any failing pages.

## Costs

AI reads about 13 pages a day, roughly 8k tokens each, at the email reader's model prices. That is cents per month. The scout has its own monthly cap (`SCOUT_MONTHLY_BUDGET_USD`, default $3), separate from email reading.

## Honest limits

- **The source pages couldn't be loaded from this build environment** (outbound network is restricted). Every address came from search results on the company's own domain. The scout checks each one on its first run.
- **Big US retailers often block bots or build pages with JavaScript.** Those show `robots.txt disallows` or `page has no readable text` in `last_status`. Affiliate feeds are the reliable route for them.
- **Caribbean retailers rarely post codes online.** Shared public codes from users' email will likely be the richest source there.
- **The privacy policy text was updated for interests and shared codes.** Have it reviewed before launch, like the rest of the policy.
- **No "second read" by another model.** The checks are deterministic quote matching against the page, which is stricter than a second model opinion. A second read can be added if quality data shows a need.
