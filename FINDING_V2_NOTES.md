# Finding more in real email (from the first real "What PerkScan read" report)

That report had 167 messages:
- 124 had nothing to use.
- Most of those were Uber Eats and Uber One emails, Dell sales, and Amazon notices.
- Several were clearly useful but were dropped.

## What changed
- **Memberships from email.**
  - The reader notes a paid membership when the email treats the reader as a member ("as an Uber One member…"). It's stored as `inbound_messages.membership_seen` (migration `20261102000018`).
  - The app also reads member-only wording in existing summaries.
  - Two or more such emails, for a membership not yet added, triggers the Home nudge: "Your email shows you're an Uber One member. Add it to see what it includes." Adding it unlocks its perks and the paying-twice check.
- **Refunds on their way.**
  - "Return accepted / refund issued: $34.66" becomes a refund item that's already started.
  - It's keyed by store and amount, so the "return accepted" and "refund issued" emails are one item.
  - Ten days later PerkScan asks "Did it arrive?". Rows read "Refund on its way · issued …".
- **Same offer, different wording, counted once.** Offers without a code are keyed by amount or percent plus their distinctive words. "30% off select fresh groceries every Tuesday (Uber One)" and "…on Tuesdays" are now one item.
- **Trial end dates.** When an email gives a trial's length ("7-day free trial"), the end date is worked out from the email's date.
- **In-app deals.**
  - Examples: "Buy 1, get 1 free at Shake Shack", "free item over $15". These have no code and no stated end, so they used to be dropped.
  - Up to 3 per email are kept for 7 days, keyed per week.
  - Never money, never at risk, missed or reminded about.
  - Money shows them under "In the app this week", and they show under matching interests in Deals.
- **Re-reading past emails.**
  - `rereadAll` in the Gmail script sends the last 12 months with `reread: true`.
  - Ingest re-queues even emails already read. Offers found again aren't added twice, and an email isn't its own "duplicate".
  - Credit matching is already idempotent.
- **Eval cases added:** Uber One member (and an ad that isn't membership), refund on its way, in-app BOGO.

## To ship
1. `git pull`
2. `npx supabase db push`
3. `npx supabase functions deploy ingest process-inbox`
4. Paste the new `gmail/PerkScan.gs` into Apps Script and run **rereadAll** once.
