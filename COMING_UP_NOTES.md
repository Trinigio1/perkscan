# Coming up near you (2026-10-23)

## Why
A list of everything you already have is a one-month product: people find it, use it, and cancel. What keeps them
subscribed is something **new every week** that costs them money if they miss it. "Coming up" is that feed.

## What's built
- **Events catalog** (`seed/events.json` → `local_events`): dated, money-related events with official sources.
  - Each event has its countries, plus optional US states.
  - Bank promotions can target one card type, e.g. only Scotiabank **Mastercard** holders.
  - Two statuses:
    - **confirmed:** announced for these dates.
    - **expected:** comes back every year but isn't announced yet. Dates are from last time, and the app shows **Check** with "Not announced yet. Ran Oct 16–31, 2025."
- **Starting content:**
  - **US:** national park free-entry days (Oct 27, Nov 11), Medicare Open Enrollment (until Dec 7), Marketplace enrollment (Nov 1 – Jan 15), FSA year-end (expected).
  - **Trinidad & Tobago:** Scotiabank Mastercard Divali cash back and Scotiabank Visa Christmas cash back (both expected, from last year's dates).
- **Home is simpler:** the big number, shortcuts, **Use soon** (your things), and **Coming up** (up to 4: events near you first, then "For you" suggestions). **See all** opens the full Coming up screen.
- **Remind me** on any event adds it to Money with its deadline, so the 7-day and 2-day reminders fire. For an expected event the reminder stays **Check** until it's announced.
- **Weekly Sunday notification** now includes "Coming up: …" for events that start or end that week. It fires even when nothing of yours expires, so there's a reason to open the app every week.

## Keeping it current (this is what a subscription pays for)
The feed is only valuable if it's fresh. Plan on about 1–2 hours a month:
1. Check each bank's promotions page (Scotiabank, Republic, First Citizens) and the government calendars.
2. Add new events to `seed/events.json`. When a source announces dates, switch the event from expected to confirmed.
3. Roll yearly events forward.
4. Run `npm run seed:build -- --migration`, then `npx supabase db push`.

Later, an admin screen or a small scheduled job could suggest candidates, but a person should still confirm every date.

## Checked
- **Unit tests:** 302 pass. They cover:
  - which events apply (country, state, bank, card type)
  - date labels
  - expected events counted as Check
  - reminders, including unconfirmed ones
  - the weekly digest with events
- **Database tests:** 12 files, 167 checks, 0 failures. The catalog is read-only, expected events must say what they're based on, sources must be https, and an event can't end before it starts.
- **Browser:**
  - A **TT Visa Classic** user isn't shown the Mastercard promotion, but is shown the Visa Christmas one. Its reminder sits under "Worth checking" as Check.
  - A **US** user sees Medicare, park free days and Marketplace on Home. Remind me puts Medicare in Money as Confirmed.
  - No errors.

## Your setup
`git pull`, then `npx supabase db push`, then reload.
