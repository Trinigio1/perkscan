# Real value, trusted numbers (from the second real inbox)

## 1. Trust fixes
- **One offer, one row.** Offers are keyed by the store that sent the email (email.uber.com and uber.com → "uber"), so "Uber" and "Uber Eats" emails are one store. Re-reading an email replaces its earlier results; anything the user acted on is kept.
- **Currency.** An offer stated in another currency ("60 EUR off") keeps that currency and is never added to a dollar total.
- **Discounts aren't cash.**
  - "Spend $75, save $15" and "$20 off $100" are stored as `discount_amount` with `min_spend`, never in Ready to use.
  - They're estimated (≈) only when your usual spend at that store meets the minimum.
  - Existing rows were converted by migration `20261102000019`.
- **In-app deals** (BOGO, free item) are dated from when the email was sent (`inbound_messages.sent_at`): shown for 7 days from then, and skipped if older.
- **Not PerkScan's value:**
  - No return-window reminders, and no refunds for returned items.
  - Connection-test codes are never saved (What PerkScan read confirms the test).
  - Existing rows dismissed.
- **Deals:**
  - The same deal worded twice shows once.
  - Vague "Up to X% off …" banners with no code or end date are dropped.
  - "Everything else" never counts as a match.

## 2. Student perks and subscriptions
- **Home:** "+ N student perks for you" under the total, and a panel when a subscription has a cheaper student price.
- **Subscriptions screen:** the same amount from the same company about every month or year (or a known subscription service).
  - Shows what it costs a year.
  - Shows student prices checked on the providers' pages: Spotify $12.99 → $6.99, Apple Music $11.99 → $6.99, Prime $14.99 → $7.49 (US, checked 2026-10-27).
  - Flags anything a membership already includes.

## 3. When you need it
Money has a new panel for:
- card credits you get back when you pay for something (e.g. Global Entry/TSA PreCheck, up to $100);
- what your memberships include.

Never in the total. Tapping one opens the card.

## 4. Deals from your own stores
- **Where stores come from.** The scout looks up promotion pages for stores on users' receipts first (`_purchase_store_candidates`, migration `20261102000020`): the receipt's sender domain, plus store names matched to known official sites (a Chipotle order through Uber Eats → chipotle.com). Then it looks up stores that email several users.
- **Safety checks.** robots.txt and the promotions-page checks apply as before.
- **Privacy.** The privacy text says only the store is looked up, never who bought there.

## To ship
1. `npx supabase db push` (000019, 000020)
2. `npx supabase functions deploy ingest process-inbox scout`
3. Gmail script: paste the new version and run **rereadAll** once, so existing emails get the new rules.
