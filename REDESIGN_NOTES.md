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
