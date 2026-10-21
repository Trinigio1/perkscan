# Phase 3: Currencies, Scotiabank T&T cards and the matching engine

PerkScan now knows where you live and what currency you spend in. It matches each receipt to the card that paid,
tells you which of that card's protections apply (with deadlines and a claim checklist), and counts purchases toward
card credits automatically. Amounts are **never converted** between currencies. Totals are kept per currency and
shown like `TT$450 + US$35`, with your home currency first.

## What was built

**Currencies and countries**
- **Profile:** `country` and `home_currency` columns.
  - New step 1 of onboarding, "Where do you live?". It guesses from the phone's time zone (`America/Port_of_Spain` → Trinidad & Tobago), and you always confirm.
  - Change it later in **Settings → Country & currency**.
  - Home shows a banner if it isn't set yet (existing accounts).
- **Every amount carries a currency:** cards, card benefits (which can differ from the card's, e.g. US$ coverage on a TT$ card), opportunities, recovered money and receipts.
- **The parser** reads currencies from emails (`TT$` → TTD, `US$` → USD). If an email doesn't say, your home currency is used.
- **App totals are per currency:**
  - **Home:** your home currency big, with `+ US$35` beneath when there's money in another currency. The tiles work the same way.
  - Credits, Offers and Wallet totals are per currency too.
- **Worth the fee?** compares the fee only with credits in the card's own currency. Others are listed separately, not converted.

**Card catalog: Scotiabank Trinidad & Tobago**
- Scotiabank Visa Classic, Aero Platinum Visa, Gold Mastercard (cash back) and Scotiabank Mastercard. Country `TT`, currency `TTD`.
- All are `TODO_VERIFY` with **no amounts**. I couldn't confirm fees or coverage limits from an official Scotiabank source, so nothing is invented. Protections are stated in US$, which is how Visa/Mastercard benefit guides usually word them. That too needs your confirmation.
- The card picker shows cards from your country first, then "Other countries".

**Matching engine** (`supabase/functions/_shared/matching/`)
- **`match.ts` (pure, unit-tested):**
  - receipt → card by last 4 digits. If two of your cards share the same last 4, we don't guess.
  - Each protection then has its own rule:
    - **Purchase / return protection and price protection:** goods of 50+ (receipt currency), deadline = purchase date + the card's window when known.
    - **Extended warranty:** electronics, appliances and phones.
    - **Cell phone protection:** a phone bill paid with the card (one per card).
    - **Trip delay / cancellation / baggage:** flights (and hotels for cancellation), until 2 days after travel.
    - **Rental car:** car rentals, until pick-up.
- **Protections never have a dollar value.** They're coverage, not cash, so they never count toward "left on the table".
  - Each one says which card it's on, the coverage limit if verified (and if it's in a different currency from the receipt), and "not verified" when the terms aren't confirmed.
  - The checklist covers what documents to keep, then "call the number on the back of your card ending XXXX". **PerkScan never files claims.**
- **Auto credit use:** a receipt on a card whose credit lists that merchant (e.g. Uber on Amex Gold's Uber Cash) counts toward the open credit for that period, in the same currency only.
  - Marked `auto`; it never overrides something you marked yourself.
  - It's capped at the credit's value.
  - Each receipt can only count once.
- **`process-inbox` `rematch` action:** runs automatically after you add a card or change its last 4 digits, so older receipts get matched too.

**App screens**
- **Offers → Card protections:** a new section; tap one for details. **I made a claim** asks what the claim paid you (that counts as recovered). **Not needed** dismisses it.
- **Card screen → Recent purchases on this card:** each matched receipt with the protections and return window it triggered.
- **Home → Where the money is:** Card protections are now live ("N active · coverage, not cash").
- Scotiabank card colours (red Classic, silver Platinum, gold Gold, dark Mastercard).

## Verified here
- 128 Jest tests (new: currency formatting, per-currency score, country guess, matching rules), plus 4 pgTAP files (0 failures, incl. 14 new currency/matching checks).
- Deno end-to-end inbox test against a local Supabase: receipt matched → purchase protection created; Uber receipt auto-marked US$23.50 of Uber Cash; rematch is idempotent.
- Browser walkthrough as a new user in Trinidad's time zone:
  - TT pre-selected, Scotiabank cards listed first.
  - Home in TT$ and the Offers total reads "$15 + TT$50".
  - A TT$3,499 Courts appliance and a US$129 Amazon receipt on card ··4321 each got Price protection plus a return window.
  - A grocery receipt on another card number matched nothing.
- `tsc`, lint, and a web export are all clean.

## Your setup steps (Windows, VS Code terminal)
1. `git pull` then `npm install`
2. `npx supabase db push --include-seed`. This adds the new columns and loads the Scotiabank cards.
3. Redeploy both functions (they changed):
   - `npx supabase functions deploy ingest --no-verify-jwt --use-api`
   - `npx supabase functions deploy process-inbox --use-api`
4. `npx expo start --clear`, then open the app:
   - **Home → "Where do you live?"** → Trinidad & Tobago (TTD) → Save.
   - **Wallet → Add** → Scotiabank Visa Classic, with your real last 4 digits.

No new env keys this phase.

## What to test
- [ ] Home shows **TT$** as the big number. Settings → Country & currency shows "Trinidad & Tobago · amounts in TTD".
- [ ] Add card: the Scotiabank cards appear under "Cards in Trinidad & Tobago".
- [ ] Label a recent receipt paid with your Scotiabank card "PerkScan". It must show the card's last 4 digits; many Trinidad receipts don't, and then it can't be matched. After ≤10 minutes:
  - The receipt shows under **Card → Recent purchases on this card**.
  - If it's goods of 50+, Price protection appears under **Offers → Card protections**.
- [ ] A receipt in US$ (e.g. Amazon) shows `US$` amounts. Offers / Home show it next to TT$, not added together.
- [ ] Open a protection: "I made a claim" asks for an amount, and "Not needed" dismisses it.
- [ ] Change a card's last 4 digits (Card → Edit): receipts re-match.

## Please verify with Scotiabank
Everything on the Scotiabank cards is unverified until we have their terms.
- Ask for the **Visa Classic benefits guide**, or call the number on the back of your card (Scotiabank T&T lists **(868) 62-SCOTIA**).
- Things to ask:
  - Does price protection apply, for how many days, and up to what amount?
  - Is there purchase protection or extended warranty?
  - What is the annual fee?
- Send me what they say and I'll fill in the catalog, with `last_verified` and `source_url`.

## Known limits
- Receipts need the card's last 4 digits to be matched. Statement or SMS matching comes in Phase 4.
- No currency conversion, by design. A single "total in TT$" would need live exchange rates.
- Phone push reminders for protection deadlines come later (we only remind for items with a date).

*PerkScan informs and guides. It does not file claims, contact merchants, or give financial or legal advice.*
