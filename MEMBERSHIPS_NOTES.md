# More value than the inbox: memberships, paying twice, honest totals (2026-10-25)

## 1. Totals you can trust: no more trade-in "money"
- **The problem:** a trade-in offer ("get up to $1,200 when you trade in your iPhone") was counted as $1,200 you're owed. It isn't.
- **Not counted any more:**
  - trade-ins
  - "up to" amounts
  - financing
  - sweepstakes ("chance to win")
- **How:**
  - The reader is told so.
  - A fixed rule enforces it whatever the AI returns (`notMoneyOwed`, tested).
  - Migration `20261102000007_not_money_owed.sql` removes the amount from items already in your account. The items stay visible but no longer add to the total.

## 2. Memberships
Eleven memberships with perks taken from each provider's own site (a test enforces this):

| Membership | Highlights |
|---|---|
| Amazon Prime ($139/yr) | Grubhub+ included, Prime Video, Whole Foods extra 10% off sale items, free grocery delivery $25+ |
| Walmart+ ($98/yr) | Paramount+ Essential **or** Peacock Premium included, 10¢/gal fuel, free delivery $35+ |
| Costco Executive ($130/yr) | 2% reward up to $1,250, **$10/month same-day delivery credit** ($150+ orders) |
| Sam's Club Plus ($120/yr) | 2% Sam's Cash up to $750, **Walmart+ included**, free shipping $50+ |
| Instacart+ ($99/yr) | Peacock Premium included, $0 delivery $10+ |
| Uber One ($96/yr) | $0 delivery + up to 10% off, Uber One credits on rides |
| DashPass ($96/yr) | $0 delivery fees, 5% back on Pickup |
| Target Circle 360 ($99, or $49 with the Target Circle Card) | same-day delivery $35+, 2-day shipping, 30 extra days to return |
| T-Mobile Experience Beyond / More | Netflix with ads included (Beyond also Hulu), Apple TV $3/mo, T-Mobile Tuesdays |
| AAA | up to 10% off hotels, up to 20% off Hertz, roadside help |

**Where you add them:**
- during setup (an "Also a member of…" section on the card picker)
- in Settings → Memberships
- from Your cards
- from the Home nudge

**How they work:** memberships live in the same catalog as cards (`cards.kind = 'membership'`), with no card number. So their perks, credits (the Costco delivery credit), reminders, "Checked on the official site" dates and **Worth it?** all just work. They're never offered as a way to pay in "Before you pay", and receipts are never matched to them.

## 3. "You may be paying twice"
- **What it does:** looks at subscription charges in your own receipts (last ~6 weeks) and checks them against what your memberships and cards already cover.
  - **Included:** "Peacock · $7.99 — your Walmart+ already includes this."
  - **Card credit:** "Hulu · $18.99 — your Amex Platinum gives back up to $18.99 a month on it. Pay with that card and enroll first." This isn't shown if that card already paid.
  - **Membership inside a membership:** paying for Walmart+ while Sam's Club Plus includes it.
- **Amounts:** only real charges are shown, nothing estimated. A credit counts up to one month of it.
- **Where it shows:** Home and the "We found $X" screen.
- **Spotting memberships you pay for:** if your receipts show you pay for Walmart+, Uber One, DashPass, Instacart+, Prime and so on but haven't added it, Home says "You pay for Uber One. Add it to see what it includes", and the Memberships screen marks it.

## Checks
- **App tests:** 434 pass. New ones cover the service matching, paying twice, membership hints and the trade-in rule, run against the real card and membership catalogs.
- **Database tests:** 233 pass. New ones check that memberships have no card number, are added once each, cards still need 4 digits, and the Costco credit is tracked.
- **Email pipeline (end to end):** 4 of 4 pass. Receipt matching now ignores memberships.
- **Browser walkthrough:**
  - picking Walmart+ during setup added it
  - Home flagged the $7.99 Peacock charge as included with Walmart+
  - Home suggested Uber One from the receipt
  - the Walmart+ page shows its perks and "Worth it?"

## Your setup
1. `git pull`
2. `npx supabase db push`
3. `npx supabase functions deploy ingest process-inbox`
4. `npx expo start --tunnel -c`, then Settings → Memberships.
