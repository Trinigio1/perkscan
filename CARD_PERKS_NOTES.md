# Card perks: the full list, and "Not the right card?"

## Why

A user knew they had airport lounge access through a card, and PerkScan didn't show it. The card was a **Scotiabank Trinidad & Tobago** card, not the Bank of America card first suspected.

Scotiabank T&T's own pages tie Priority Pass to two things:
- The **AERO Mastercard Black**, which was missing from the catalog.
- **Premium Banking**: 4 lounge visits a year with a Premium Banking credit card, or 10 with a Mastercard Black.

**Scotiabank / First Citizens fixes** (migration `038`):
- New: `scotiabank_tt_aero_mastercard_black`, with Priority Pass, AERO Rewards points and a personal assistant service.
- New: `first_citizens_tt_visa_infinite`, with Priority Pass.
- The `scotiabank_tt_aero_platinum_visa` lounge entry now says access comes through Premium Banking (4 visits a year).
- Seed test: First Citizens terms may also come from firstcitizensgroup.com, which replaced firstcitizenstt.com as the bank's site.

On Bank of America: Premium Rewards ($95) has no lounge membership; only Premium Rewards Elite ($550) includes Priority Pass. Keep a standard Premium Rewards card as it is. Switch only if the card really is the Elite.

## Not automatic yet

The catalog is checked by hand from issuer pages. It covers 49 card products and is not refreshed automatically. Cards outside it get no perks. See "Next" below.

## What changed

**Catalog** (`seed/card_benefits.json`, migration `036`):
- New card: `boa_premium_rewards_elite`, with:
  - $300 airline incidental credit
  - $150 lifestyle credit
  - $120 Global Entry / TSA PreCheck
  - Priority Pass Select lounges
  - airfare discount
  - trip delay, trip cancellation, baggage, and rental car coverage
  - Preferred Rewards bonus
- 52 perks added to existing cards: protections, no foreign transaction fees, priority boarding, status, entertainment access and more. Each entry comes from the issuer's own page or benefits guide. No amount is invented; a perk without a stated amount has none.
- Elite earn rates (`seed/earn_rates.json`): 2 points per $1 on travel and dining, 1.5 on everything else, at 1¢ a point.

**Switch a saved card** (`src/domain/cardDraft.ts` `siblingCards`, card screen):
- The card screen shows "Not the right card?" when the issuer has easy-to-confuse cards in the same family. Examples: Premium Rewards vs Elite, Sapphire Preferred vs Reserve, Delta Gold vs Platinum.
- **Switch** changes the product; the last 4 digits and matched purchases stay.
- Migration `037` (`_user_cards_after_change`): when `card_id` changes, the old product's unused credits are removed and the new product's credits are created. Credits already marked used are kept, along with the money recovered from them.

**Left out (unverified):**
- Wells Fargo card protections
- Standard Venture lounge visits
- Standard Premium Rewards protections
- Amex Gold trip delay

## Tests

- `cardDraft.test.ts`: which cards count as siblings.
- `29_card_switch.test.sql`:
  - switching works
  - the old card's unused credit is removed
  - a used credit stays
  - the new card's credits appear, with the new amounts
- Browser check: switched Premium Rewards → Elite and back. Credits followed each switch, with no page errors.

## Ship

```
git pull
npx supabase db push --linked
npx expo start --tunnel -c
```

Then open your Scotiabank card in Cards. If it's the AERO Mastercard Black, add that card, or use **Switch** under "Not the right card?".

## Next

A card scout: a monthly job that rereads every card's official page and benefits guide. Changes are evidence-checked: each one is applied only with a quote from that page, and dollar amounts wait for review. When someone adds a card that isn't in the catalog, the scout looks it up on the issuer's site.
