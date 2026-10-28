# "Saved": PerkScan notices what you used, from your receipts

## How it works
- The reader now records what was taken off each order: promo codes, coupons, gift cards and store
  credit paid with, rewards, membership savings (`receipts.discounts`, prompt 2026-11-11). No card numbers.
- When a receipt arrives, `usage.ts` matches its lines to your open codes, gift cards and credits:
  - **The same code** as one of your offers at that store (or a long, specific code anywhere): marked
    used by itself, with what the receipt took off.
  - **A gift card / credit / reward line** at a store where you have exactly one such credit: used when the
    amount matches, otherwise asked.
  - **Any other discount** at a store where you have exactly one open offer: **asked, never assumed**.
  - Membership savings, delivery-fee waivers and sale prices never count as your offers. Only offers
    seen before the purchase and not expired by then count; each item is used once.
- Asked on Home: "Did you use this on your Oct 20 Uber Eats order? The receipt shows: Promotion −$6.20"
  → **Yes, I used it** (adds it to Saved) / **No** (stops asking for receipts up to now).
- Home's small "Used" number is now **Saved**. Used items say where they came from
  ("Used · Spotted on your Oct 25 Acme receipt"); the item's page has Undo.
- Card credits already worked this way (matching receipts to your cards); this adds codes and gift cards.

## Database (migration `20261102000026`)
- `receipts.discounts`; `recovered.marked_by` ('user' | 'auto') and `recovered.source_receipt_id`;
  `opportunities.used_guess_*`.
- `_mark_used_from_receipt` (service role only; never overrides what you did) and
  `answer_used_guess` (you, for your own offers).
- Fixed: used offers with no end date weren't loaded, so they never showed under Used.

## Tests
jest (`usage.test.ts`, `usedFromReceipts.test.ts`), pgTAP `22_used_from_receipts`, e2e (code on a receipt →
used automatically; a plain discount → asked → Yes → $5 saved; not callable from the app).

## Ship
1. `npx supabase db push`
2. `npx supabase functions deploy ingest process-inbox`
3. On your computer: `git pull origin phase-1`, then `npx expo start --tunnel -c`
4. Optional: run `rereadAll` in the Gmail script so past receipts get their discount lines read
   (≈ $1 of AI for a year of email). Without it, this starts from new receipts.
