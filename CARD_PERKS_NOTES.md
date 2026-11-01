# Card perks: the full list, and "Not the right card?"

## Why

A user with a Bank of America Premium Rewards card ··6042 knew they had airport lounge access, but PerkScan didn't show it.
Bank of America's own pages explain why:

- **Premium Rewards ($95 fee)** has no lounge membership. Its $100 airline incidental credit can cover airline lounge day passes.
- **Premium Rewards Elite ($550 fee)** includes Priority Pass Select for the cardholder and up to 4 people (enrollment required).

So the card most likely added was the wrong product.

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

Then open the Bank of America card in the Cards tab, choose **Switch** under "Not the right card?", and pick **Premium Rewards Elite**.
