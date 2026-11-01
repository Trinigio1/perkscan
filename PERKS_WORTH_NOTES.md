# What your perks are worth

Home now shows a **"What your perks are worth"** panel: a yearly total of everything the user's cards and memberships give them, with the biggest items named. Tapping it opens Card perks, which shows the same total and a value next to every perk that has one.

## How each value is worked out

| Kind | Value | Shown as |
|---|---|---|
| Statement credits (monthly, yearly…) | The issuer's amount × periods in a year | `$300` (exact) |
| One-time credits (Global Entry, PreCheck) | The issuer's "up to" amount | `$120` (exact) |
| Perks with a yearly allowance (4 or 10 lounge visits, 2 United Club passes, a year of DashPass) | Allowance × the provider's own price | `≈ $350` |
| Perks used per trip (unlimited lounge access, free checked bag) | Price × the user's flights in the last 12 months, one per booking. A free bag counts only on that card's airline | `≈ $70` |
| Per-trip perks not used this past year | Price per use, **not added** to the total | `≈ $35 each use` |
| Protections, status, insurance | Not valued | — |

No value is invented. A perk counts only with a sourced price (`worth`, `worth_basis` and `worth_source_url` on the benefit, which the seed schema enforces). The panel also shows what the cards and memberships cost a year in fees.

## Prices used (`seed/card_benefits.json`)

| Price | Used for | Source |
|---|---|---|
| US$35 per lounge visit (what Priority Pass charges Standard members) | Amex Platinum, Sapphire Reserve, Venture X, Premium Rewards Elite (per visit). Scotiabank AERO Mastercard Black (10 visits = US$350), AERO Platinum (4 = US$140), Republic AAdvantage Visa Infinite (2 = US$70) | prioritypass.com |
| $59 per United Club one-time pass | United Explorer (2 = $118) | united.com |
| $45 first checked bag (Delta, tickets from April 8, 2026) | Delta Gold and Platinum (per flight on Delta) | delta.com |
| $45 first checked bag, prepaid (United, tickets from April 3, 2026) | United Explorer (per flight on United) | united.com |
| $96 for a year of DashPass (annual plan) | Sapphire Preferred | doordash.com |

The provider pages couldn't be opened from the build environment. The figures were read from those pages' text via web search on 2026-11-01, and each benefit's `notes` says so. Prices change, so recheck them along with the catalog (the planned card scout should cover this).

Left unvalued on purpose:
- First Citizens Visa Signature: its lounge visits may be charged.
- First Citizens Visa Infinite: its free visits aren't stated.
- Freedom Unlimited's DashPass: its length isn't stated.

## Code

- `src/domain/perkValue.ts`: `tripsInLastYear`, `usesThisYear`, `perksWorth`.
- `src/domain/included.ts`: `includedWorth(items, usesOf)` now counts per-use worths by the user's trips. Home's "Save up to" uses it, so the two numbers agree.
- `src/components/PerksWorth.tsx`: `usePerksWorth` and `PerksWorthPanel`, on Home and at the top of Card perks.
- `src/app/perks.tsx`: a value badge and its basis on each valued perk.
- `src/lib/data.tsx`: a year of flight bookings (`flights`), since the main receipts list only covers 180 days.
- Migration `039`: catalog with the worths.

## Tests

- `perkValue.test.ts`: trips (dedupe, 12-month window, airline), uses per perk, totals, per-use perks not counted until used, and unverified credits and protections left out.
- `included.test.ts`: per-use worth × uses.
- Browser check on the local stack: AERO Mastercard Black, Sapphire Reserve, Amex Gold and Premium Rewards, with 2 flights. Shows ≈ $2,824 a year ($2,404 credits + ≈ $420 perks) against $1,311 in fees, with no page errors.

## Ship

```
git pull
npx supabase db push --linked
npx expo start --tunnel -c
```
