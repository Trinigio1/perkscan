# Claiming made easy

## One Claim button on every perk

Every open item has a **Claim** button: on its row in Home's Use soon and in Money, and as the main button on its own screen. It takes you to where you actually use it.

| Item | What Claim does |
|---|---|
| Code, gift card, store credit | Copies the code, then opens the store the email came from (e.g. target.com) or the link in the email |
| Card credit spent at one merchant | Opens that merchant: Lyft, DoorDash, Uber, Peloton, Apple TV+, CLEAR, Global Entry / TSA PreCheck, Dunkin', Resy, Saks, StubHub, Walmart+, lululemon |
| Other card credits and perks | Opens the issuer's own page on how to use it |
| Card protections | "How to claim" on the issuer's page, plus the claim details to copy |
| Price drops, refunds, double charges, returns | Opens the request PerkScan wrote for you (below) |
| Settlements | Opens the official claim form; the details to copy are on the item's screen |
| Deals | Copies the code and opens the store's page |
| Hidden money, student offers, bank promotions | Opens the official page ("Search for mine", "Check my balance", "Claim") |

- **Only official destinations:** a link from the item itself, the domain its email came from, the issuer's page, or the short list of merchant sites in `src/domain/claimTarget.ts`. If there's none, there's no button; PerkScan never guesses an address.
- **Follow-up:** a few days after you press Claim, PerkScan asks **"Did you use it?"** (or **"Did it arrive?"** for money you asked for back).
  - **Yes** records it as used or recovered.
  - **Not yet** asks again later.
  - **Didn't use it** keeps the item and stops asking.
- **No nested buttons:** the button sits beside each row, not inside it.


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
- Migrations `20261102000001_claims.sql` and `20261102000002_claim_cancel.sql`: `start_claim`, `snooze_claim_check` and `cancel_claim` (pgTAP `15_claims`).
- `src/domain/claimTarget.ts`: where each Claim button goes (unit-tested).
- Analytics: `claim_started` (kind) and `claim_checked` (arrived, not_yet, didnt_work). No personal data.

## Deploy
Run `npx supabase db push`. No function changes.

## Also in this change: US-first
New users are offered the United States (or "Somewhere else"). Anyone who already chose another country keeps it, and their data stays. The other countries can return one at a time, after their legal checks.
