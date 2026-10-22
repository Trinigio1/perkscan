# Hidden money: more places money hides (US + Caribbean)

## What's new

### Hidden money screen (Home → Hidden money)
Grouped by what to do, filtered to your country, from official sources only:

| Section | United States | Caribbean |
|---|---|---|
| **Money waiting in your name** | State unclaimed property via MissingMoney.com (free) | **TT:** Central Bank list of unclaimed government bond payments · **JM:** Ministry of Finance unclaimed bank balances · **BS:** Central Bank dormant accounts (claim through your bank) · **BB:** banks' inactive-account lists (*unconfirmed*) |
| **Points and miles that expire** | AAdvantage (24 months inactive), Marriott and Hilton (24 months), Starbucks Stars (6 months) | Caribbean Miles and Massy Card (*expiry unconfirmed*), plus AAdvantage, Marriott and Hilton |
| **Use it or lose it** | Health FSA: plan-year deadline, 2½-month grace **or** US$680 carryover for 2026 | Add your own (work allowances, birthday rewards) |
| **Price drops after you buy** | Target 14 days · Best Buy during the return period · Costco 30 days · Macy's 10 days | None found (PriceSmart lists no price-drop policy) |
| **Refunds you may be owed** | DOT cash refunds for cancelled or 3h+/6h+ delayed flights · billing errors (60 days to dispute) | DOT rules apply to flights to/from the US · EU261 for flights from Europe |
| **Free with a library card** | Libby, Kanopy | **TT:** NALIS (Libby, Flipster, EBSCO) · **JM:** Jamaica Library Service · Libby anywhere |

- **Unconfirmed entries** say so, and never claim a rule we couldn't verify.
- **Student offers** are linked from this screen too.
- **New countries:** The Bahamas and Guyana are now in the country list.

### Add anything by hand (Home → Add)
- **What you can add:** points or miles, a gift card, store credit, a use-it-or-lose-it benefit, or a refund you're owed. Paste a text is here too.
- **From a program:** pick it, and its expiry rule and how-to come with it.
- **Reminders:** you get reminded 7 and 2 days before the date.
- **Points never count as cash in totals.** Money amounts do.
- **Delete:** items you added can be deleted from their detail screen.

### Found automatically
- **Price drops:** a receipt from a store with a price adjustment policy opens a "Price drop? Get the difference back" window until the deadline.
- **Warranties:** a receipt that states one ("2-year warranty") starts a countdown.
- **Possible double charges:** two settled card alerts with the same amount, store, card and day raise "Charged twice at X?". It's never counted as money owed, because it may be two real purchases.
- **Refunds:** emails offering a refund (a cancelled flight, an overcharge) become a Refund item, with the amount if stated.
- **Reader changes:**
  - card-linked offers ("add this offer to your card") are noted as needing activation
  - "your points expire on…" emails become Points items
  - reader version bumped to `2026-10-29`
- **Money tab:** new filters for Points & miles, Refunds and Benefits.

## Checked here
- **Unit tests:** 262 pass. New ones cover:
  - price adjustment windows, including "during the return period" and US$ purchases by non-US users
  - stated warranties and double-charge rules
  - Money filters and the Hidden money grouping
  - date and amount parsing
  - a check that every catalog entry has an official source
- **Database tests:** 11 files, 162 checks, 0 failures. New ones:
  - the catalog is read-only and needs a source and https links
  - adding by hand rejects card credits and past dates
  - points carry no cash value
  - other users can't see or delete your items
- **End-to-end (3 pass):**
  - a Target receipt opens a 14-day price-drop window and a 12-month warranty
  - two identical KFC alerts flag one double charge
  - a cancelled-flight email becomes a US$412.80 refund
  - an item added by hand uses your home currency and can be removed
- **AI reader test set:** 4 new cases (refund, warranty, expiring miles, card-linked offer). **Run `npm run eval` to measure the real reader on them.**
- **Browser:** opened Hidden money for Trinidad & Tobago, added 12,000 Marriott points and a TT$300 allowance, saw them under Money with the new filters, and deleted one. There were no errors.

## Your setup
1. `git pull`
2. `npx supabase db push` adds the new item types, the catalog and add-by-hand.
3. Redeploy the reader functions (they changed):
   - `npx supabase functions deploy ingest --no-verify-jwt --use-api`
   - `npx supabase functions deploy process-inbox --use-api`
4. Optional: `npm run eval` with your API key, to check the 4 new cases.

## Not done / limits
- **Caribbean stores:** I found no price-adjustment policies for Caribbean stores.
- **Unconfirmed:** Caribbean Miles and Massy Card expiry rules, and Barbados unclaimed balances. Tell me if you see the official terms.
- **Refund rules for flights inside the Caribbean:** I found no general passenger-rights law to cite.
- **Double charges outside the US** point you to your bank, since there's no US-style dispute law to cite.
- **The "Refunds you may be owed" rules** are guidance with official links. PerkScan doesn't decide whether you qualify.
