# Money owed (pillar 1 of 6)

Money a company owes you back now comes first, ahead of codes. Three new pieces do this.

## 1. Flight disruptions → refunds owed

The reader now pulls a `flight` block from airline emails: status, delay, airline, flight number, date,
countries, booking code, and whether you accepted a rebooking or credit. `flights.ts` applies the official
rules from the catalog:

| Rule | When | Amount shown |
|---|---|---|
| US DOT | The flight touches the US, you didn't accept another option, and it was cancelled, delayed or moved 3+ h (domestic) or 6+ h (international) | The ticket price, from the booking's receipt. With no receipt, no number. |
| EU261 | The flight departs the EU/EEA/CH, or lands there on an EU airline; cancelled, or 3+ h late | "Up to €600". No number: the amount depends on distance, and the airline can claim extraordinary circumstances. |

- One claim per flight (`flight:<airline>:<number>:<date>`). It replaces the email's generic "Refund available" item.
- Delays are rounded down, so 400 minutes reads "6+ hours". It is never rounded up.
- PerkScan only says what you may be owed and drafts the request. It files nothing.

## 2. Real price drops (Target, Best Buy, Costco, Macy's)

- At ingest, product links from order emails at stores with a price-adjustment policy are kept. Tracking is
  removed, and Macy's keeps its product ID. The links are copied onto the receipt.
- The hourly scout now runs the price watch first. Each purchase is read **at most once a day**, while the
  store's window is open:

  | Store | Window |
  |---|---|
  | Target | 14 days |
  | Costco | 30 days |
  | Macy's | 10 days |
  | Best Buy | Until the return-by date |

  Each run reads at most 40 pages, and at most 3 links per receipt.
- Pages are read by the same polite reader as the deal scout: https only, robots.txt respected, same site
  only, and size and time capped. The price comes from the store's own structured data on the page
  (JSON-LD Product/Offer, or price meta tags). There is no AI, so it costs nothing.
- A drop counts only when it is at least $1 **and** at least 3%. It becomes one item per purchase: "Price
  dropped: get US$X back on …", with what you paid against today's price, a link to each product page, and
  the store's policy.
- An existing amount is never lowered, and items you've marked used or dismissed are never touched.

**Not proven yet.** This session can't reach the store sites, so the reader has only been tested against
saved page shapes. Big stores often block bots or render prices with JavaScript. If that happens, the scout's
response lists the error per store under `prices.errors`, and nothing wrong is shown to users: no page means
no drop. Check `prices` in the scout's response after the first day.

## 3. "Owed to you", first

- **Money tab:** a new **Owed to you** section sits at the top of To use. It holds refunds, price drops with a
  checked amount, and settlements. Possible double charges stay in "Worth checking", because they are guesses.
- **Home:** one new line goes above "ready to use now": "**$X owed to you · N to ask for**". The ready line now
  excludes that amount, so nothing is counted twice. The "Save up to" total is unchanged. Nothing else on Home
  moved.

## Tests

| Suite | Result |
|---|---|
| Jest | 551 pass, including new money, flights and price-watch tests |
| pgTAP | All pass |
| End-to-end | 8 pass. Booking → cancellation → a $669.23 refund. A $70 Target drop, not re-read the same day. |
| Browser | Money and Home checked |

## To ship

```bash
git pull
npx supabase db push                                   # migration 000029
npx supabase functions deploy ingest process-inbox scout
npx expo start --tunnel -c
```

The reader prompt changed (version 2026-11-14), so run **rereadAll** once in the Gmail script. That brings
past flight emails and product links in.
