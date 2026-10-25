# Simplified around one promise (2026-10-25)

> PerkScan automatically finds the money, perks, benefits, credits, protections and offers you
> already have access to, then helps you use or claim them before you lose them.

Every feature was tested against "is this something you already have, or are about to lose?"

## Removed
| What | Why | How |
|---|---|---|
| **Shared deals** ("3+ people near you got this code") | Other people's codes, not yours; privacy and fraud risk; only works at scale | Migration `20261102000005_retire_shared_deals.sql` stops the jobs, deletes shared deals, sightings and store statistics, switches everyone off, and blocks switching it back on. The Settings toggle and privacy-policy paragraph are gone. |
| **Interests / spending step in setup** | Only fed generic deal ranking | Setup is 5 steps: country → cards → card details → email → finish |
| **Deals tab** (generic "Deals for you", "people like you") | Public sales everyone has made PerkScan look like a coupon app | Replaced by **Offers at your stores** (below) |
| **Reading accuracy in Settings** | A tool for us, not users | Still reachable from Inbox; "Something's wrong" reports still feed it |
| **Explore chips and the deals section on Home** | Clutter from scattered features | Everything has a home in the tabs |

**Unchanged:** store discovery (which store pages the deal finder checks, from domains that email 3+ users) never depended on sharing and keeps running. The database columns for interests and sharing stay, so older app versions don't break.

## Navigation: 4 tabs
- **Home:**
  - **Ready to use** (big)
  - **Recovered** this year
  - **At risk** this week
  - **Benefits**: confirmed non-cash benefits from your cards, never given a dollar value
  - then **Act now**
- **Your stuff:**
  - your cards
  - what they get you: benefits, gift cards/credit/points, offers at your stores, which card to use
  - because of who you are: student, unclaimed money and settlements, coming up
  - where PerkScan looks
- **Activity** (was Money): to use, used, missed, plus the monthly recap
- **Settings:** sources, country, theme, reminders, student, privacy and data

Old routes all still work (`/money`, `/cards`, `/perks`, `/hidden-money`, `/student`, `/checkout`, `/coming-up`). Only `/deals` and `/interests` were removed.

## Act now: one ranking rule (`src/domain/priority.ts`)
- **Score:** urgency + value + ease, × confidence.
  - **Urgency:** a day or less 40, 3 days 32, a week 24, two weeks 14, a month 6.
  - **Value:** on a gentle log curve ($10 ≈ 12, $100 ≈ 24, max 30); unknown 4.
  - **Ease:** a tap 6, a request 2, a form 0.
  - **Confidence multiplier:** confirmed ×1, likely ×0.85, check ×0.5.
- **Left out:** protections (only matter if something breaks), claims already waiting (they get "Did it arrive?"), used credits, and return windows more than 7 days from closing.
- **Offers and events** only compete when they end or start within 7 days, and are weighted ×0.7, so optional spending never outranks money that's already yours.
- **Shown:** the top 5, each with its Claim button.

## "Because…" on every item (`src/domain/reasons.ts`)
- **What it says:** Amex Gold ·· 4242 · From your email · From a text · Your Zara purchase · You added this · Saved from Target's offers.
- **On the item's screen:** the full reason, e.g. "Found in an email from target.com."
- **When unsure:** if PerkScan doesn't know, it says nothing rather than guess.

## Offers at your stores (`storeOffers` in `src/domain/deals.ts`)
- **Only stores you use:** a store's own promotions show only if you've bought there or it emails you ("You shop at Courts", "Target emails you").
- **Never shown:** other people's codes, offers already in your inbox, and anything you hid.
- **Where they appear:** in Your stuff → Offers at your stores, and in Act now when ending within a week.

## Analytics added
- `onboarding_started`
- `onboarding_step` (step reached / total), for the drop-off funnel
- `claim_started` now includes `method`: copy_and_open, open, copy, email_draft, copy_message, form, details
- `act_now_tapped` (kind and position)
- `offers_viewed`

No amounts, stores or personal data are sent.

## Your setup
1. `git pull`
2. `npx supabase db push`: retires shared deals (plus the card catalog and Peloton migrations if not pushed yet)
3. `npx expo start --tunnel -c`
