# Simpler Home and one-tap "Send request"

## Home: one job, "what should I do today?"

Nothing was removed. Everything Home showed is still one tap away.

| Part | Before | Now |
|---|---|---|
| Headline | "Save up to" with up to 7 lines under it | **3 lines**: owed to you, ready to use now, and "+ ≈ $X more you could save". Tapping the third shows the estimate lines (codes at your stores, deals, card and membership perks, student prices), then "Show less". |
| The three numbers | This week / Saved / Missed | Unchanged |
| Panels below | Up to 10 stacked panels | **One "Next up" card**: the most important item in full, then "N more things to do", which opens the new **Next up** screen with all of them, unchanged |
| Use soon | 4 items | **3** items |
| Deals for you | — | Unchanged |
| Explore | — | **What you're missing** and **Before you pay** moved to the front |
| First-run tour | — | Unchanged |

**Next up order:**
1. Questions only you can answer: "Did you use it?", "Did it arrive?"
2. Setup still to finish.
3. "We found $X".
4. A card found in your email or bank.
5. Paying twice.
6. Perks to turn on.
7. Student prices.
8. Memberships.

**To undo it:** it's one commit, so `git revert <this commit>` brings back the old Home exactly.

## Send request: refunds and price drops in one tap

- **Where:** refunds, price drops and flight claims now have **Send request** right on their row, in Money's
  "Owed to you", in Use soon and on the "PerkScan found" screen.
- **Nothing missing:** one tap opens your own email with the request written. PerkScan marks it as started, so
  it asks in a few days whether the money arrived.
- **Something missing** (an order number or booking reference it never saw): it asks for just that, then
  opens your email. Nothing goes out with a [blank] in it.
- **Your name:** saved the first time, so later requests are signed without asking.
- **Price drops** now use what PerkScan's own price check found ("Dyson V8 was US$399.99 and is now
  US$329.99"), with a link to today's price, so there's nothing to fill in.
- **Flight claims** read like flight claims: the flight, the booking reference, and the rule.
  - U.S.: a refund of the ticket price under the DOT rules.
  - EU: compensation under EU261, without inventing an amount.
- **Still informing, not acting:** PerkScan never sends anything. You choose who it goes to and press send.

## Tests

| Suite | Result |
|---|---|
| Jest | 605 pass |
| New tests | Filling blanks (unanswered ones stay visible); reading checked prices; a price drop with nothing to fill; flight wording for U.S. and EU claims |
| Browser | Home with the 3-line headline, Next up card and "2 more things to do"; the Next up screen; Money rows with Send request |
| Browser, sending | One tap on the Target price drop opened email with the order number, both prices and the product link, and marked it started. The flight refund asked for its booking reference, then opened email and marked it started. |

## To ship

```bash
git pull
npx expo start --tunnel -c
```

No database or function changes.
