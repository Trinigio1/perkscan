# Phase 6: Personal school perks, polish and launch prep

## What was built

### Personal school perks
Once a student picks their school, **Student offers** is built around it.
- **"Your perks at UWI St. Augustine"** sits at the top, with the counts: perks only for your school, perks for all
  students, and how many you've claimed. If you set a school email domain, it also shows which email to sign up with.
- **Only for [your school]'s students:**
  - Perks that only that school's students get, from the school's own pages.
  - Perks you add yourself, which show as "Added by you".
  - An **Add a perk from [school]** button, for a campus discount, free software or a service PerkScan doesn't list.
    Your added perks are private. You can tick **Suggest it to PerkScan** so we can check it and add it for everyone at
    the school. Only the perk is shared.
- **For all students — with your @school email:** the general offers. Each one has a **"For you"** line saying how
  *you* get it:
  - "Use your @ufl.edu email"
  - "Pick [your school] on the SheerID form"
  - "Verify as a [school] student with UNiDAYS"
  - "Have your student ID ready"
- **Not available in your country:** shown with the reason.
- **New UWI St. Augustine perks**, found on UWI's own pages on 2026-10-22:
  - **EndNote** reference software through my.uwi.edu (UWI Libraries).
  - **Campus Health Services:** free screenings and a Student Health Plan for full-time students.
  - **Free counselling (CAPS).** Marked *not verified*: I only found it in campus notices, not on a services page.
  - These join Microsoft 365 through UWI and Pelican Perks, so UWI has **5 school-only perks**.
- **Home's student row** now reads "Your perks at [school]".

### Weekly "money at risk" notification
- **When:** every Sunday at 6 pm, covering what expires in the coming week. For example:
  *"TT$50 + US$10 at risk this week — Uber Cash, KFC code — use them before they expire."*
- **When it's skipped:** in weeks where nothing expires.
- **How it works:** it's a local notification, rebuilt from fresh data every time the app syncs, alongside the
  existing 7-day and 2-day reminders.
- **Limit:** if the app isn't opened for weeks, it uses what it knew last time. Server push would remove that limit;
  it needs a real-device build (see Release below).

### Monthly recap
**Home → [Month] recap** shows, for this month or any earlier one:
- what you recovered, and from how many things
- what you used
- what was left on the table
- the month before, for comparison

### Share card
**Home → Share my total:** "I found TT$X I was leaving on the table with PerkScan".
- X is what you've recovered this year plus what's still available.
- **Only the total is shared:** never stores, cards or offers.
- It uses the phone's share sheet. Where a browser has no share sheet, it copies the text instead.

### Settings
- **Export or delete my data**
  - **Export:** one JSON file with everything PerkScan keeps about you, across 11 tables. Token secrets are never
    included.
  - **Delete:** type DELETE to permanently delete your account and everything in it at once. It runs on the new
    `account` server function. Every table holding your data is set to delete along with the account, and the tests
    check that.
- **Connected sources:** every Gmail account and your texts Shortcut, each with Revoke. There's also the forwarding ID
  with **Make a new ID**. It's reserved for email forwarding, which PerkScan doesn't use yet.
- **Privacy policy** and **Terms of use:** draft screens written to match what the app actually does. They're marked
  as drafts, and **a lawyer must review them before launch**.
- **Share anonymous usage stats:** an on/off switch. It only appears when analytics is configured.

### Analytics (PostHog)
- **Off unless you set it up:** it only sends anything if `EXPO_PUBLIC_POSTHOG_KEY` is set. Leave it empty and it's
  off completely.
- **Only fixed events:** only the events in `src/domain/analyticsEvents.ts` are sent, and each can carry only certain
  harmless details (a count, yes/no, a fixed category). Anything else is removed before sending, and tests check this.
- **Never sent:** emails, names, stores, card digits, amounts or codes.
- **Anonymous:** each install uses a random ID, not your account. PostHog is told not to build a person profile.
  Opting out deletes the ID.

### Store and release prep
- **`docs/APP_STORE_PRIVACY.md`:** answers for Apple's App Privacy label and Google Play's Data safety form, plus a
  pre-submission checklist.
- **`eas.json` and `docs/RELEASE.md`:** EAS builds.
  - **Android preview APK:** free.
  - **Google Play internal testing:** needs a US$25 Play developer account.
  - **iOS TestFlight:** needs the US$99/year Apple Developer Program. You don't have it yet, so iPhone release builds
    are blocked until then.

## Verified here
- **201 unit tests**, including:
  - the "For you" lines
  - the weekly digest (Sunday timing, per-currency totals, skipped when nothing expires)
  - the monthly recap
  - share text
  - the export (no secrets)
  - analytics filtering
- **Database tests:** 10 files, 148 checks, 0 failures. New ones:
  - your own perks are private, links must be web links, and you can't add perks for others
  - **deleting an account leaves zero rows in all 12 tables holding user data**, and other accounts are untouched
  - regenerating the forwarding ID changes only yours
- **End-to-end:** account deletion refuses a missing confirmation and signed-out requests, and then really removes the
  user and their data.
- **Browser:**
  - picked UWI St. Augustine and saw the personal sections
  - added my own perk
  - pasted an offer and marked it used, so the recap showed TT$10 and the share card said "I found TT$10"
  - made a new forwarding ID
  - opened the privacy policy
  - **exported** (11 tables, no token secrets)
  - **deleted the account**, which went back to sign-in, and confirmed the user and their rows were gone
- **Bug found and fixed:** export failed at first, because the app correctly can't read token fingerprints. It now
  asks only for the columns it's allowed to read.

**Not tested here:**
- Notifications on a real phone. They need a device; the web version doesn't show them.
- EAS builds. They need your Expo account.
- Sending to PostHog. No key is set.

## Your setup (VS Code terminal)
1. `git pull`. If `supabase/seed.sql` blocks it, run `git checkout -- supabase/seed.sql` first.
2. `npm install`
3. `npx supabase db push`. This adds your-perks, forwarding-ID regeneration and the new UWI perks.
4. **Deploy the new account function**, and redeploy the others:
   - `npx supabase functions deploy account --use-api`
   - `npx supabase functions deploy ingest --no-verify-jwt --use-api`
   - `npx supabase functions deploy process-inbox --use-api`
5. `npx expo start --clear`

**New optional env keys** (in `.env`): `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST`, only if you want
analytics.

## What to test
- [ ] Student offers → pick your school. The "Your perks at…" card appears, with UWI's 5 school-only perks and "For
      you" lines on the general ones.
- [ ] **Add a perk from UWI St. Augustine.** It shows "Added by you". Tap it to edit or delete.
- [ ] Mark an offer used, then Home → **recap** shows it, and **Share my total** shows the total.
- [ ] Settings → **Connected sources** lists your Gmail tokens. Don't revoke the one your script uses unless you mean
      to.
- [ ] Settings → **Export or delete my data → Export** downloads a file.
- [ ] **Only on a throwaway account:** Delete everything. Make one with another email first; deleting can't be undone.
- [ ] Settings → Privacy policy / Terms open. They're drafts.

## Known limits
- **The weekly digest is a local notification** (see above).
- **School-only perks** exist only where we found them on the school's own pages: UWI St. Augustine today. Suggestions
  from users will help us add more.
- **Legal text is a draft.** Publish reviewed versions at public URLs before any store submission.
- **iOS release builds** need the paid Apple Developer account.

*PerkScan informs and guides. It does not file claims, sign you up for offers, or give financial or legal advice.*

## Update: where "at risk" money comes from, and T&T card benefits (2026-10-22)

### At risk this week
- **The Home tile now names the sources:** for example, "From KFC, Courts". Tapping it opens **At risk this week**.
- **The new screen groups everything expiring in the next 7 days by where it comes from:**
  - Card benefits: each card, with its credits. Tap the card to open it.
  - Stores: codes, gift cards and store credit.
  - Each group has its own subtotal and expiry dates.
- **Tapping the Sunday digest notification** opens the same screen.

### Card benefits (Trinidad & Tobago)
**The reason nothing showed:** every benefit in the catalog was still unverified, so cards showed "Not verified" everywhere.

**Scotiabank:**
- **No Fee Visa Classic:**
  - No annual fee in the first year, and none after if purchases average TT$1,250 a month.
  - Up to 3 free extra cards.
  - The **price protection** listed before was a guess based on other banks' cards, and Scotiabank doesn't list it. It's removed, along with anything built from it.
  - This card has no credits or protections Scotiabank publishes, so it adds $0 to totals. That's accurate, not a bug.
- **Mastercard:** TT$180 annual fee and purchase protection up to US$100 per occurrence.
- **Gold Mastercard:** up to 4% cash back and purchase protection up to US$200 per occurrence. The fee stays unverified because Scotiabank's pages disagree (TT$300 or TT$375).
- **AERO Platinum:** 1 ScotiaPoint per US$1 and 3,000 bonus points. Purchase protection and extended warranty are included, but no limits are stated.

**New cards:**
- **First Citizens:** Visa Classic, Visa Gold, Visa Platinum, Purple Card, 2 in 1, Vacation Lifestyle Mastercard. They include price protection with a 30-day window, so PerkScan can now show deadlines for these.
- **Republic Bank:** International Visa Classic, Visa Gold, and the PriceSmart Visa Platinum (4% back at PriceSmart, 1% elsewhere).

**How these were checked:**
- This build environment's network blocks the banks' sites, so I read the banks' own page text through web search. I didn't open the pages directly.
- Each verified benefit links to the bank page and says this in its notes.
- A test makes sure every verified T&T benefit points to the bank's own website.
- Some bank pages are years old. Confirm with the bank before relying on a limit.

**New card screen note:** cards with no statement credits now explain why they add nothing to "left on the table".

### Your setup
1. `git pull`
2. `npx supabase db push` to load the new cards and remove the guessed benefit.
3. In the app, open your card to see what's verified.

## Update: lounges and other card perks (2026-10-22)

### New: Your card perks
Open it from **Home → Your card perks** or from the Wallet.

**What it shows:** every non-credit benefit across your cards, grouped by when you'd use it:
- **At the airport:** lounges, Global Entry and CLEAR
- **When you travel:** travel medical and accident insurance, trip delay, baggage, car rental
- **Status and concierge:** hotel status and concierge services
- **Rewards:** points, miles and cash back
- **Shopping protections**
- **Card services:** fees, extra cards and emergency help

**Each perk shows:**
- which of your cards has it
- what it includes
- whether it's checked or not verified
- "Enroll first" when you have to sign up before you can use it
- a link to the bank's page

**Flight nudge:** when PerkScan finds a flight booking with a future departure date, a banner says "You fly on [date] — your [card] can get you into an airport lounge".

**Wallet:** each card now also shows how many perks it has.

### Perks added or checked (2026-10-22, from each issuer's own page via web search)
- **Lounge access:**
  - **Amex Platinum:** Centurion Lounges, Delta Sky Club when flying Delta (10 visits a year), and Priority Pass (enroll first).
  - **Chase Sapphire Reserve:** Priority Pass Select and Sapphire Lounges, with 2 guests free and US$27 for each extra guest.
  - **Capital One Venture X:** Capital One Lounges and Priority Pass. Guest rules have changed, so check them first.
- **Amex Platinum hotel status:** Marriott Bonvoy Gold Elite. Amex also lists Hilton Honors Gold, but confirm it applies to your card.
- **Scotiabank AERO Platinum:**
  - a Priority Pass membership (600+ lounges; the number of free visits isn't stated)
  - travel medical insurance for trips up to 60 days
  - travel accident insurance up to US$500,000
- **New cards:**
  - **Republic Bank / AAdvantage Visa Infinite** (US$150): Priority Pass with 2 free visits every 12 months.
  - **Republic Bank Visa Signature** (US$100): concierge, hotel perks, and travel insurance when the whole fare is paid with the card.
  - **First Citizens Visa Signature** (TT$600):
    - Visa Airport Companion. Visits may be charged, so check before you go.
    - Visa Concierge.
    - Baggage delay up to US$500 and baggage loss up to US$1,000.
    - Purchase protection and extended warranty up to US$5,000.
- **Not checked for the US cards:** annual fees and statement credits are still unverified. Only the perks above were checked.

### Your setup
1. `git pull`
2. `npx supabase db push`
