# Perks for you

Perks the user has access to that their inbox will never mention, ranked for them, each with a reason.

## What it finds
- **Comes with what you have**
  - Issuer perks for banks you hold a card from: Bank of America Museums on Us, Amex Offers, Chase Offers, Capital One Offers, Citi Merchant Offers.
  - Your own card and membership perks that match what you're into (e.g. lounge access if you're into travel). Until PerkScan knows your interests, all of them are listed, lower down.
- **Free for you to get**
  - Free loyalty and birthday rewards at stores you actually use: Sephora, Ulta, Chipotle, Panera, Dunkin', Starbucks, AMC, CVS, Target Circle.
  - Price-match policies at stores you shop at.
  - Library perks.
  - Unclaimed money in your country, IRS Free File, and National Park fee-free days.

US only for now, except libraries, unclaimed money and airline/hotel loyalty, which follow the catalog's countries. Only `active` (verified) catalog entries are shown.

## How it ranks (`src/domain/forYou.ts`, pure and tested)
| Signal | Points | Reason shown |
|---|---|---|
| You shop there (receipts) | +40 | "You shop at Sephora" |
| The store emails you | +30 | "Chipotle emails you" |
| You hold a card from the issuer | +40 | "You have a Bank of America card" (required for issuer perks) |
| Student-only, and you're a student | +25 | "You're a student" (required) |
| An interest you picked | +20 | "You're into beauty" |
| An interest your receipts show | +12 | "You spend on eating out" |
| Your own card/membership perk | 25 + interest | "Comes with your Gold Card" |
| Base by kind | 3–9 | — |

Rules:
- A store program needs a personal reason. Free programs open to everyone (unclaimed money, tax filing) don't.
- An interest-only perk is shown to everyone until interests are known; after that it needs a matching interest.
- "Everything else" is never used as a reason.
- "I have it" and "Not for me" hide a perk for good (`perk_feedback`, RLS on own rows). "Show N hidden" brings them all back.

## Where it shows
- Home hero: "+ N perks for you beyond your inbox".
- Home: a "Perks for you" section showing the top 3.
- `/for-you`: the full list.

## Data and privacy
- New migration `20261102000010_free_perks.sql`:
  - `perk_programs.interests`, `issuers` and `student_only` columns.
  - The `free_perk` kind.
  - The `perk_feedback` table.
- `20261102000011_catalog_data.sql` loads 15 new free perks. Each was checked against the provider's official page; `source_url` and `last_verified` are in `seed/programs.json`.
- Nothing is stored except the "I have it" / "Not for me" answers. These are included in data export and listed in the privacy text.
- Analytics events `for_you_viewed` and `perk_for_you` carry counts and actions only.

## To ship
- `npx supabase db push` (applies migrations 000005–000011 if not yet pushed).
- No edge function changes.
