# Earn rates and the bank-first scan

## 1. Earn rates: which card to use

`seed/earn_rates.json` holds what each card earns where: **29 US cards, 108 rates**. Every rate links to the
issuer's own page and was checked on 2026-10-29. Rates with a cap or a condition carry it
("on up to $50,000 a year", "with Apple Pay", "booked through Chase Travel").

### How cards are compared

- **Cash back:** compared as stated.
- **Points with a cash value the issuer states:**

  | Points | Cash value | Source |
  |---|---|---|
  | Chase and Bank of America | 1¢ each | Chase's and Bank of America's own pages |
  | Amex Membership Rewards | 0.6¢ each, as a statement credit | Amex's US points page |

  So Amex Gold's 4x at restaurants counts as about **2.4%**. That's a floor: Amex points can be worth more on
  some travel, and the screen says so.
- **Airline and hotel points with no stated cash value** (United, Marriott, Hilton, Delta, Capital One miles,
  Citi points): shown by their rate ("6x points") but **never turned into dollars or ranked against cash**.
  I couldn't verify a cash rate for Capital One miles, so they aren't ranked either.
- **Rates PerkScan can't check:** the category you picked on Customized Cash, this quarter's rotating 5% on
  Freedom Flex and Discover, and Custom Cash's "top category". These show as **"Maybe 5%, if…"** tips, never
  as the answer.
- **Not in yet:** Delta Platinum; Wells Fargo Autograph beyond streaming (its other categories weren't
  confirmed on a current Wells Fargo page); and United's flight rate. Better missing than wrong.

### Where it shows

- **Before you pay** has a new **Most rewards** panel. For example, at Chipotle: "Amex Gold ·· 4242: 4x points,
  ≈ 2.4% back in cash value, on up to $50,000 a year", followed by your other cards.
- It sits next to the existing credits and protections panel, which is unchanged.
- **New categories:** Gas and Drugstore, both recognized from store names and from bank data.

## 2. The bank-first scan

Connecting a bank now goes straight to **What PerkScan found**:

| Line | In the headline? | What it is |
|---|---|---|
| Owed to you | Yes | Refunds, price drops, settlements |
| Card credits to use | Yes | Open now, with a known amount left |
| Paying twice | Yes | Charges a membership or card already covers |
| More with the right card | **No**, it's already spent | The last 90 days. For each purchase matched to a card: what your best card would have earned, minus what the card you used earned. Stated cash values only, never a rate needing Apple Pay or a chosen category. A floor, not a guess. |
| Memberships you pay for | No | Seen as charges, not yet added |
| Cards found in your bank | No | Credit accounts you haven't added, suggested like cards seen in email (one tap adds them) |
| Subscriptions | No | Count and yearly cost |

Also new on the bank side:
- Bank purchases now get the same **price-drop window** and **double-charge** checks as emailed card alerts.
- Credit cards in a connected bank that you haven't added are suggested to you (name and last four only).

### Getting people there

- **Onboarding step:** now "Find what you're missing", with **Bank** first and Gmail and texts still there.
- **Home Next step card:** same card in the same place, now "Connect your bank or email", opening the bank
  screen.
- **Bank screen:** adds "See what PerkScan found" and "Use email instead".

## Tests

| Suite | Result |
|---|---|
| Jest | 598 pass. Earn tests run against the real catalog file. |
| Earn checks | Gold beats Premium Rewards at restaurants; 2% cash beats 1.5 points; Apple Pay noted; Hilton points never ranked against cash; rotating categories only as tips; ties stay ties; missed earnings is a floor that ignores Apple Pay rates |
| Scan checks | Headline is only money you can still get; wording; empty state |
| pgTAP | `28_earn_rates` added (a points value needs its source; read-only from the app). All 296 checks pass. |
| End-to-end | Bank connect now also checks the card suggestion: 7777 suggested; the card you have and the checking account not. All 15 pass. |
| Browser | Before you pay at Chipotle shows Gold 4x (≈2.4%) above Premium Rewards 2x. The scan shows $177 in credits; $2.62 more with the right card on Chipotle and Publix (checked by hand: $1.00 + $1.62); 1 card found. |

## To ship

```bash
git pull
npx supabase db push --linked        # migrations 034 (earn tables) and 035 (catalog incl. earn rates)
npx supabase functions deploy bank bank-webhook
npx expo start --tunnel -c
```

Plaid secrets as before (`PLAID_*`, `BANK_TOKEN_KEY`). Without them the bank button says it isn't set up yet,
and Before you pay still shows earn rates.

## Keeping rates right

Issuers change rates (Chase did in June 2026). Re-check `seed/earn_rates.json` every few months against each
`source_url`. Then run `npm run seed:build -- --migration` and `db push`.
