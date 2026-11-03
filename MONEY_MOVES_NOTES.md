# Money moves: six ways PerkScan adds money people wouldn't find

All six are built on what PerkScan already knows (cards, memberships, receipts with their item lines, trips) and stay within the rules:
- PerkScan informs and guides; it doesn't cancel, file or contact anyone.
- It never invents an amount.
- Money counts only when the user confirms it, with the amount they saw.

## Where people see it

- **Home: a Money moves card**, always shown near the top. It lists how many moves are waiting, the money at stake, and the top two, or a calm "nothing to do right now". Tapping it opens the screen.
- **Money moves screen** (`/moves`, also Explore → "Money moves"): every move with why (in the card's own terms), numbered steps, a link (card terms, recall page, rebate finder), a confirm button ("I dropped it", "I declined it", "I cancelled it"…) that asks for the amount, and "Not for me". Below it, **What you've kept**, with "Stopped?" for savings that repeat.
- **Next up** on Home shows the most pressing move.
- **Before you pay** (feature 3) and the **card screen** (feature 4) show theirs in place.
- **Found by PerkScan** (the This-month card on Home, the recap, and `npm run metrics:value`) counts confirmed savings:
  - one-off savings in their month;
  - monthly ones every month until "Stopped?";
  - yearly ones in their month.

  They all count as found, because PerkScan pointed them out.

## The six

### 1. You already have this (`src/domain/moves.ts`)

Each check needs a card whose relevant cover has verified terms; a guess never produces advice.

| Move | Detected from | What it says | Counted as |
|---|---|---|---|
| Phone insurance | A protection line on the phone bill (Mobile Protect, Protection 360, Protect Advantage, Asurion…) in the last 75 days, plus a card with cell phone protection | Card may already cover the phone; pay the bill with that card; compare deductible and limits; remove the add-on | Monthly, the charge amount |
| Rental car waiver | A car rental pickup in the next 60 days, plus a card with rental car coverage | Pay for the whole rental with the card, decline the counter waiver, check exclusions | Once, the amount the user saw at the counter |
| Store protection plan | A protection-plan line on a receipt from the last 45 days (Geek Squad, Allstate, SquareTrade…), plus a card with extended warranty or purchase protection | The card extends the warranty; compare; many stores allow cancelling for a refund | Once, the plan's price |
| Trip insurance | A trip insurance line or insurer receipt from the last 60 days, plus a card with trip delay, cancellation or baggage cover | Compare cover; check the policy's review period for a refund | Once, the price |

### 2. Points about to expire

Points PerkScan read from email that expire within 30 days, soonest first. They're marked used on the item itself, so the usual "Did you know about it?" question follows.

### 3. Your stack at checkout

"Before you pay" now opens with **Your stack here**, steps in order:
1. gift cards and store credit;
2. the single best code (codes rarely combine);
3. **card offers** (promos emailed by card companies: activate, then pay with that card);
4. student price;
5. membership perks;
6. for electronics, **skip the store's protection plan if you pay with your card that extends warranties**;
7. the card to pay with, from the earn rates.

"Off for sure" counts only stated amounts and balances. This also fixed an old bug: opening "Before you pay" with a store already chosen never showed anything.

### 4. Annual fee day

Within 45 days of a card's fee (the anniversary of its open date), the card shows:
- the credits used in the last 12 months against the fee;
- a request script to ask about retention offers;
- a cheaper card from the same family (from the catalog);
- a reminder that many issuers refund a fee after a switch within a set time.

Confirming records what the user kept (a waived fee, a credit, or a switch). Cards with a fee but no open date get a hint to add the date.

### 5. Recalls and rebates

- **Recalls:** the scout fetches U.S. CPSC recalls once a day (`_shared/recalls/cpsc.ts`; the first run fetches 18 months). The app matches them on the phone against the user's own receipt lines:
  - by model number, or by maker name plus at least two product-name words;
  - deliberately cautious, so a vague "space heater" never matches.

  The move shows the recall page and the maker's remedy. For a refund, the receipt price is pre-filled.
- **Rebates:** an appliance of a kind ENERGY STAR certifies, bought in the last 120 days, links to ENERGY STAR's Rebate Finder. Kinds covered: fridge, freezer, dishwasher, washer, dryer, AC, heat pump, water heater, dehumidifier, air purifier, thermostat. They're read from the receipt lines, so a vacuum never triggers it. No amount until the user confirms one.

### 6. Money you qualify for (`seed/programs.json`)

These appear wherever programs already show (Perks for you, Hidden money).
- **American Opportunity Tax Credit** (IRS): up to $2,500 per eligible student a year, up to $1,000 refundable. Students only. Points to the IRS page and Form 8863. Information, not tax advice.
- **Lifeline** (FCC): up to $9.25 a month off phone or internet for eligible households. Points to lifelinesupport.org.

## Data

- **Migration 043:**
  - `savings`: own rows only, written only through `confirm_saving` / `end_saving`; keys and amounts checked.
  - `product_recalls`: public reading, written only by the scout.
  - `_value_report` now counts savings as found, with `found_by_type` showing `saved:<kind>`.
- **Migration 044:** catalog (the two programs).
- **App data:** `savings`, `recalls` (18 months), and `itemReceipts` (the last year's receipts with item lines).
- **Analytics:** `money_move { kind, action: done | dismissed | open }`.

## Tests

- **Jest (641 pass):**
  - `moves.test.ts`: only verified covers count; each move's detection, amounts and wording; points ordering; fee dates and fee day; cautious recall matching; rebates; done/dismissed moves hidden.
  - `checkout.test.ts`: stack order and the "for sure" total.
  - `monthValue.test.ts`: savings counted by month and kind.
  - `cpsc.test.ts`: recall parsing.
- **pgTAP (334 ok):** `32_money_moves.test.sql`:
  - only you confirm your savings, never by writing the table directly;
  - keys and amounts are checked;
  - recalls are written only by the scout;
  - the report counts one-offs, repeating savings, and stopped ones correctly.
- **Deno end to end:** `recalls_e2e.test.ts` covers the first fetch going back 18 months, skipping the same day, the next day starting a week before the newest recall, and stored remedies.
- **Browser** (local stack, a test wallet with Venture X, Sapphire Preferred, Amex Gold and BofA, plus test receipts):
  - all eight move kinds listed with the right wording;
  - "I dropped it" saved $17 a month and moved it to "What you've kept";
  - Best Buy's stack showed "$45 off for sure" (gift card $25 + code $20);
  - the Venture X page showed fee day;
  - Home's November card counted the $17 as found;
  - no page errors.

## Limits

- Detection depends on what PerkScan reads. Phone insurance only shows when the bill's line items reach it (email receipts, or a separate Asurion charge). A bank transaction usually shows only the carrier total.
- Bank offers in the stack come from the card company's emails. Offers that live only in the bank's app aren't seen.
- Recall matching needs item names on receipts; many card alerts don't have them.

## Ship

```
git pull
npx supabase db push --linked
npx supabase functions deploy scout
npx expo start --tunnel -c
```
