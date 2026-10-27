# Reading the right emails

## More of what holds money
The Gmail script now also sends:
- every bank and card email that mentions offers, deals, cash back, rewards, points, credits, benefits or bonuses, plus card-linked offer programs (BankAmeriDeals, Amex/Chase/Capital One/Citi offers);
- school (.edu) emails about discounts, free software, perks or benefits;
- subscription and billing emails: renewals, your plan or membership, price changes, upcoming charges;
- loyalty summaries and balances, account and promotional credits, gift card balances.

The searches run in groups of 5, so no single Gmail search gets too long. Sign-in codes, social, forums and spam are still skipped.

The reader now keeps free perks from a school or employer ("Free Microsoft 365 for students") when the email has the official link to claim them. Prompt version `2026-11-07`; new eval case.

## Less noise
- **Weekly cap.** At most 3 promotional emails per store per week are stored and read; daily newsletters repeat themselves. Emails about the user's own account or money (receipts, orders, statements, payments, refunds, renewals, rewards, balances, credits, trials and similar) are always read. Emails sent again to be re-read are never capped.
- **Hide all offers from a store.**
  - The button is on any offer from a store's emails, and saves to `store_mutes` (migration `20261102000021`, RLS on own rows).
  - That store's promotional emails are skipped before any AI reading.
  - Its offers and deals are hidden in the app. Receipts, card credits, protections and anything already acted on are kept.
  - Undo it in Settings → Hidden stores.
- **What PerkScan read** no longer counts dismissed items as found (old return windows, test codes, rewards for doing something).

## To ship
1. `npx supabase db push`
2. `npx supabase functions deploy ingest process-inbox`
3. Paste the new `gmail/PerkScan.gs`, run `previewPerkScan` to see the new counts, then run `rereadAll` once.
