# Redesign: simpler PerkScan (2026-10-22)

## What changed

### Four tabs instead of five
| Before | After |
|---|---|
| Home · Credits · Offers · Wallet · Settings | **Home · Money · Cards · Settings** |

### Home
- **One big number: Ready to use.** That's everything you can still use right now: card credits, codes, gift cards and store credit.
- **Three small numbers under it.** Tap any of them:
  - **This week:** what expires in the next 7 days. Opens the breakdown by source.
  - **Used:** what you used this year.
  - **Missed:** what expired unused this year.
- **No more "left on the table".** The old headline mixed up "missed" and "still available", and the "Why is left on the table $0?" panel showed even when it wasn't $0. Both are gone; the clearer **Ready to use** and **Missed** replace them.
- **Get set up** appears for new users: "Add your cards" and "Connect your email or texts", each with a tick. It disappears once both are done.
- **Three shortcuts:** Add a text, Before you pay, Card perks, plus Student if you're a student.
- **Use soon:** the next 4 things to use, soonest first. Items with a real amount come ahead of credits whose amount isn't confirmed.
- **Recap and Share** are small links at the bottom, shown once there's something to recap.

### Money (replaces Credits and Offers)
- **Three views:** To use · Used · Missed.
- **Filter chips:** All, Card credits, Codes, Gift cards, Trials & returns, Protections, Settlements. Only chips that have something show up.
- **"To use" is grouped** by **This week**, **Later**, and **No end date**.
- **Unconfirmed amounts** show as **—** instead of "No amount".

### Cards (replaces Wallet)
- **A compact list:** small card picture, short name (for example "Platinum Card"), last 4 digits, fee, and what's available.
- **"All your perks"** sits at the top.
- **The card screen** splits its benefits into tabs: **Credits · Protections · Perks · Purchases**, instead of one long page. Each benefit shows at most 2 lines, and unconfirmed items say so in one grey word.

### Settings
- **Three groups:** **Find money** (Gmail, Texts, Add a text, Inbox, Reading accuracy), **You** (Country, Reminders, Student) and **Privacy & data**, plus Sign out.
- Most explanations under each row are gone.

### Fewer words elsewhere
Shorter copy on sign-in, welcome, onboarding, at-risk, perks, Before you pay, Student, Inbox and the connect screens. The long explanation boxes became one-line notes or went away.

- **Student offers:** "Who can get it ›" opens the eligibility details, and the duplicate "pick your school" prompt is gone.

## Checked
- 242 unit tests pass, including the new Money list rules (open/used/missed, chips, grouping, Use soon order, set-up steps) and short card names.
- Type check and lint are clean, and the Android bundle builds.
- **In the browser, no errors** across sign-in, onboarding, Home (new user and a user with cards and texts), Money (all three views), Cards, the card screen, Settings, Perks, At risk, Before you pay, Student, Inbox and Recap.

## Your setup
`git pull`, then reload the app. There are no database changes this time.

## Update: confidence labels and smarter ordering (2026-10-23)

### One label, three words
Every item now says how sure PerkScan is, with a coloured dot:
- **Confirmed** (green): an official source, or something you added.
  - Examples: checked card benefits, store price-adjustment windows, your own balances.
- **Likely** (grey): read clearly from an email or text, with an amount or code, or a date.
- **Check** (orange): a guess or an unconfirmed rule.
  - Examples: unconfirmed card credits, "Charged twice?", settlement matches, offers with nothing concrete.

This replaces the earlier mix of "Unconfirmed", "Not verified", "Checked Oct 22" and "—" badges.
- **Where it appears:** Money, Home, the card screen, card perks, Hidden money, Student offers, and the credit and offer detail screens.
- **What it means:** the detail screen says it in one line.

### Ordering: what you'd lose soonest first
Each list is sorted in this order:
1. **How soon it ends:** within 2 days, this week, this month, later, then no end date.
2. **How sure PerkScan is:** confirmed, then likely, then check.
3. **Bigger amount first.** Amounts are only compared within the same currency, never converted.
4. **Earliest date.**

### Guesses stay out of the money
- **Totals never include "Check" items:** not Ready to use, This week or Missed.
- **Money → To use** has a separate **Worth checking** group, marked "Not counted in your totals until confirmed".
- **Use soon on Home** shows surer items first. Guesses only fill empty slots.
- **Possible double charges** say "It was two purchases" instead of "Not interested", and "Your card's dispute window applies".

### Checked
- **Unit tests:** 288 pass. They cover the confidence rule for every item type, the ranking order, no amount comparison across currencies, Worth checking, and totals that skip guesses.
- **In the browser:** a KFC code showed as Likely under This week, and a TT$300 allowance as Confirmed under Later. Unconfirmed Amex credits and "Charged twice?" showed as Check under Worth checking. The total was TT$310: the guesses weren't counted. There were no errors.

No database changes. Just `git pull` and reload.
