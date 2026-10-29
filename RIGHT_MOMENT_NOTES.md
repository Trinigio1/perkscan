# Right moment (pillar 4 of 6)

PerkScan now nudges you when something becomes usable, not only before it runs out. It also tells you
everything that applies at a store before you pay there.

## New notifications

These are local, on the phone, scheduled each time the app syncs. They are off if you turned reminders
off.

| When | What it says | Rule |
|---|---|---|
| The day a card's credits reset, 10:00 | "$17 in American Express Gold Card credits is back: Uber Cash $10 · Dunkin' credit $7" | Verified, calendar-period credits only. One note per card per day. Cardmember-year credits are skipped (their date isn't known). |
| An event's first day, 9:00 | "Today: Museums on Us" | Events for banks whose card you hold, and any event you tapped "Remind me" on. |
| The 1st of your birthday month, 10:00 | "It's your birthday month: free birthday rewards at Chipotle, Sephora" | Programs mentioning a birthday reward, at stores you buy from or that you said "I have it" to. Never "Not for me" ones. No note if there's nothing to name. |

**Less noise:** expiry reminders for one card's credits ending the same day are now **one** notification
("$23 in card credits resets in 2 days: Uber Cash $10 · Dining credit $6 · Dunkin' credit $7"), not one per
credit.

All of these share the phone's limit (50 scheduled), soonest first.

## Birth month (optional)

- **Where:** Settings → **Birthday month**.
- **What's stored:** only the month, never the day or year. It's a new `profiles.birth_month` column.
  Only you can set it; a pgTAP test proves it.
- **Export and removal:** it's included in the data export, and "Remove my birthday month" clears it.

## Before you pay

Two new sections appear below "Use with it". They are additive; nothing else on the screen moved.

- **Included with your membership:** your membership's perks at that store, in the catalog's words. For
  example, Uber One at Uber Eats: "$0 delivery fee and up to 10% off…". A membership is never offered as a
  card to pay with.
- **Free at {store}:** free rewards programs at that store, including ones the perk scout finds. It says
  "You're a member: sign in or scan it when you pay" if you said you have it, else "Free to join: join
  before you pay". "Not for me" ones are hidden.

## Tests

| Suite | Result |
|---|---|
| Jest | 571 pass |
| New Jest tests | Next period start; renewals per card; event day-of rules; birthday month (this year or next, nothing to name means no note); grouped expiry reminders; Before you pay memberships and programs |
| pgTAP | `26_birth_month` added; full suite passes |
| Browser | Before you pay at Uber Eats shows Gold + Uber Cash + Uber One's perks. Birthday month saves and shows in Settings. |

Notifications can't fire in a browser, so their content and timing are covered by the unit tests. Check
them on your phone after updating.

## To ship

```bash
git pull
npx supabase db push        # migration 000032 birth_month
npx expo start --tunnel -c
```

No edge function changes.
