# Claiming made easy

PerkScan writes the request and the user sends it. PerkScan never contacts a store, bank or settlement administrator itself.

## What the user sees

On an item's screen, under **Ask for it**:

| Item | What PerkScan gives you |
|---|---|
| Price drop | A price-adjustment request to the store: order number, date and amount paid filled in; "[today's price]" left for you |
| Refund (e.g. cancelled flight) | A refund request with the amount from the email |
| Possible double charge | A message to your **bank** (not the store) to reverse the duplicate, with the card's last 4 digits |
| Return window | A return request (you fill in the item) |
| Settlement | The details to copy (store, date, amount, order number, card) and the official claim form |
| Card protection | The details to copy for your card's benefits administrator |

- **Open in my email** opens the user's own email app with the message ready. **Copy message** copies it.
- Anything PerkScan doesn't know stays as a visible **[bracketed]** gap with a warning. It never guesses.
- Starting a claim records `claim_started_at`, and Money shows "Requested … · waiting".

## "Did it arrive?"

- **When it asks:** 4 days after a claim starts, through a Home card and a phone reminder at 10:00.
  - **Yes:** records what arrived as recovered (or asks how much, if the amount wasn't known).
  - **Not yet:** asks again in 4 days.
  - **It didn't work:** closes the item.
- **Why:** only money that actually arrived counts toward the recovered total, so the number people share is real.

## Code
- `src/domain/claims.ts`: request writer and follow-up rules (unit-tested).
- `src/components/Claims.tsx`: the "Ask for it" and "Did it arrive?" UI.
- Migration `20261102000001_claims.sql`: `start_claim` and `snooze_claim_check` (pgTAP `15_claims`).
- Analytics: `claim_started` (kind) and `claim_checked` (arrived, not_yet, didnt_work). No personal data.

## Deploy
Run `npx supabase db push`. No function changes.

## Also in this change: US-first
New users are offered the United States (or "Somewhere else"). Anyone who already chose another country keeps it, and their data stays. The other countries can return one at a time, after their legal checks.
