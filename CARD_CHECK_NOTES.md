# Monthly card check, shared prices, more priced perks

## 1. More perks with a dollar value

Each perk is valued at the provider's own price for the same thing bought on its own (`seed/perk_prices.json`):

| Perk | Value | Price used |
|---|---|---|
| T-Mobile Experience Beyond: Netflix, Hulu | $107.88 + $143.88 a year | Netflix Standard with ads $8.99/mo; Hulu (With Ads) $11.99/mo |
| T-Mobile Experience More: Netflix | $107.88 a year | Netflix Standard with ads |
| Instacart+: Peacock Premium | $155.88 a year | Peacock Premium with ads $12.99/mo (from Aug 18, 2026) |
| Walmart+: Paramount+ Essential *or* Peacock | $107.88 a year | The cheaper of the two (Paramount+ Essential $8.99/mo) |
| Prime: Prime Video | $107.88 a year | Prime Video on its own, with ads, $8.99/mo |
| Sam's Club Plus: Walmart+ included | $98 a year | Walmart+ $98/yr |
| Venture X: 10,000 anniversary miles | $100 a year | Capital One's own "equal to $100 toward travel" |
| No foreign transaction fees (8 cards) | 3% of what you spent abroad on that card in the last 12 months | The 3% fee typical cards charge (Chase Freedom Unlimited's) |

**No-foreign-fee savings** only count purchases in a currency other than the card's own. A purchase your bank already converted to dollars isn't seen. With nothing spent abroad, the perk shows "Saves 3% abroad" and adds nothing.

**Not valued, on purpose:**
- Rental car coverage: no rental company publishes an official daily waiver price; third-party figures run from $10 to $46 a day.
- Free hotel nights: there's no cash price for a points certificate.
- T-Mobile's Apple TV discount: it's an "up to" amount.

## Shared prices (`perk_prices`, migration 040)

- **How a perk gets its value:** a perk points at a price, plus how many a year it includes (`worth_price`, `worth_units`, optional `worth_note` such as "Needs Scotiabank Premium Banking."). A database trigger works out the perk's `worth`, its period and the sentence explaining it. When a price changes, every perk using it is re-valued.
- **Reloads never roll anything back:** catalog reloads keep a newer price, and keep a fresher "last checked" date on a perk (`greatest(...)`).
- **Who can see what:** users can read prices but never change them.

## 3. The monthly card check

The check runs inside the hourly `scout` function. Each run handles 2 cards and 1 price whose last check is over 30 days old, so everything is re-read about once a month.

**For each card:**
- **Pages read:** the card's official page, plus up to 2 more pages on the same site that its perks were verified on. PDFs are skipped.
- **The model:** gets the page and the perks PerkScan lists for the card. It answers, with word-for-word quotes, which are on the page, at what amount, what else the page offers, and the annual fee.

`cardcheck/check.ts` then applies these rules:

| Finding | What happens |
|---|---|
| A perk quoted on the page | Confirmed. Its "Checked …" date moves to today |
| A perk sourced from this page that isn't on it | Flagged in the app: "Not found on the bank's page when checked …" (tag: Check). Queued for review. Only when most of the card's other perks *were* found on the page, so a teaser page or a JavaScript page never makes perks look gone |
| A new perk without a dollar amount (cell phone protection, lounge access…) | Added automatically in the page's own words, marked "Found on the bank's page …" |
| A changed credit amount, a credit amount newly stated, a new credit, a changed annual fee | Queued for review. Never applied automatically: PerkScan never invents amounts |

**For each price page:**
- Same price → confirmed.
- A new price within ½× to 2× of the old one, with the quote containing the number → **applied automatically**, and every perk using it is re-valued.
- A bigger jump → review.
- Price not found on the page → review.

Everything the check changes or wants changed lands in `catalog_changes` (service-role only). It runs on the scout's existing monthly AI budget (`SCOUT_MONTHLY_BUDGET_USD`, default $3). The card check costs roughly $0.30 a month at the current model price.

### Review what's waiting

```
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run catalog:review              # list
… npm run catalog:review -- --apply 3f2a                                        # apply (updates the database AND seed/*.json)
… npm run catalog:review -- --dismiss 3f2a                                      # wrong: drop it
… npm run catalog:review -- --recent                                            # what the check changed by itself
```

After applying, run `npm run seed:build -- --migration` and commit, so the next catalog build keeps it.

### Limits

- Some bank and airline pages block bots or need JavaScript (delta.com, united.com, help.netflix.com may be among them). Those show as unreachable, or as "price not found" waiting for review. Nothing is guessed, so it's worth replacing a stubborn `source_url` with a plain HTML page from the same provider.
- Cards PerkScan doesn't know yet are not looked up. That's the next step: find a card's official page from its name when someone adds or connects one.

## Deals in "Save up to"

Already included. Deals for you count when they have an honest dollar figure:
- a stated amount off, once your usual spend there meets any minimum;
- a percent off at a store where your receipts show what you usually spend.

BOGO and free-item deals, and percent-off deals at stores you've never bought from, have no basis for a number, so they're listed but not added.

## Tests

- **Jest (622 pass):** `cardcheck/__tests__/cardcheck.test.ts` covers confirming, flagging, trusting the page, amounts held back, new perks vs new credits, fees, prices confirm/update/hold/reject. `perkValue.test.ts` covers abroad spending and the 3%. `included.test.ts` covers percent worth. `perks.test.ts` covers the check labels.
- **pgTAP (311 ok):** `30_perk_prices.test.sql` covers worth from price, units, notes and currency; a re-price propagating; a reload never rolling back; users can read but not write prices; the review queue is hidden.
- **Deno end-to-end** (`npm run test:cardcheck`, local database, fake pages and model): confirm, flag, add, hold an amount change, no duplicates on re-run, a price update re-valuing the lounge perk.
- **Browser:** Home and Card perks show the new values, and the "Found on the bank's page" and "Not found…" labels render, with no page errors.

## Ship

```
git pull
npx supabase db push --linked
npx supabase functions deploy scout
npx expo start --tunnel -c
```

The scout function needs `ANTHROPIC_API_KEY` and `SCOUT_SECRET`, plus the `scout_url` / `scout_secret` vault secrets for the hourly schedule (see DEALS_NOTES.md). If deals already refresh, these are set.
