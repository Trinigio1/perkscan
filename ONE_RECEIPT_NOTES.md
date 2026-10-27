# One purchase, one receipt · true totals · faster catch-up

## 1. Receipts
- **Order updates aren't receipts.** Shipped, out for delivery, delivered, arriving, delivery date changed,
  order on hold and payment declined emails no longer make a receipt. Two layers: a reader rule
  (`prompt.ts`, version 2026-11-08) and a subject check in `toRows` (`isOrderUpdate`), which keeps a
  subject that also says receipt/confirmation.
- **Emails about one order merge** (`merge.ts`): the same order number from the same store (compared
  loosely, `#112-334 4` = `1123344`), whatever the amounts and dates; or the same store, amount and day
  when they don't name two different order numbers. Merging fills gaps only.
- **Reading an email again updates its receipt** instead of adding another (`saveReceipt` looks up the
  email's own receipt first). If the re-read finds it isn't a purchase, that store receipt is removed.
- **Cleanup** (migration `20261102000022`): `_dedupe_receipts()` removes receipts made from order
  updates and repeat copies of one order, keeping the first one with an amount. Open items made from a
  removed copy are dismissed; anything the user acted on stays. Service role only.

## 2. "What PerkScan read"
- Shows the true total received and how many are still waiting (count-only queries, no rows).
- The list shows the latest 200, with "Show 200 more" until everything is listed.

## 3. Catch-up speed
- Normal sending stays at 200 an hour per user.
- Past-mail sends (`scanPastYear`, `resendUnread`, `rereadAll`) are marked `catchup` by the Gmail script
  and may go up to **500 an hour**, only while the user has received under 5,000 in the last 7 days.
  It's a short burst, not a permanent higher rate. The monthly AI budget cap applies either way.

## Tests
- jest: merge (same order / same day / different orders), order updates, `orderKey`.
- pgTAP `21_receipt_dupes`: shipped copy removed, booking ×2 → 1, separate orders kept, items dismissed, not callable from the app.
- e2e: re-read plus a shipped email leave one receipt; catch-up gets past 200/h but stops at 500/h.
- eval: `order-shipped-not-receipt`.

## Ship
1. `npx supabase db push` (runs the cleanup once).
2. `npx supabase functions deploy ingest process-inbox`.
3. Paste the new `gmail/PerkScan.gs` into Apps Script (the catch-up flag lives there).
