# Benefits you pay for (pillar 2 of 6)

New screen: **What you pay for**. Open it from the Home shortcut row, or from the new Home panel.

## Turn these on

Perks included in what you pay that only work after you do something: link Grubhub+ to Prime, enroll in
the Amex Resy and Dunkin' credits, add the Gold Card to Uber, pick Walmart+'s streaming service.

- **What counts:** a benefit is listed when the catalog flags it `enrollment_required`, or when its own
  verified terms say enroll / activate / link it / add the card to your account / pick one. Protections are
  never listed.
- **What's left out:** anything already in use is skipped automatically. For example, a credit you've
  already used this year is clearly on.
- **Each row has three buttons:**
  - **How to turn it on** opens the issuer's page.
  - **Done** and **Not for me** each save your answer per card, in the new `perk_setup` table (with RLS, and
    only for your own cards). Removing the card removes its answers. The table is included in the data
    export.
- **On Home:** one panel, "Turn on N perks you already have", with an ✕ to hide it. It comes back only if
  the count changes. Nothing else on Home moved. There is also a new "What you pay for" shortcut chip.

## Fee against what came back, per card and membership

For each card with an annual fee, and each membership:

| What's shown | Where it comes from |
|---|---|
| **The fee** | A card's annual fee. For a membership, what your receipts show you're charged (e.g. $9.99 × 12), else the catalog's yearly price, labelled "on the yearly plan". |
| **Back this year** | Credits you used, plus member savings printed on your receipts ("Uber One savings $3.49"). Only lines that name the membership count. |
| **Credits still to use this year** | What's open now, plus calendar periods still to come (November's and December's monthly credits). |
| **"Paid for itself"** | Shown only when back ≥ fee. |

- **Facts only.** It never says to cancel or keep anything; that would be financial advice.
- **Stated limits, on the screen:** points, protections, and free delivery that doesn't appear as a receipt
  line aren't counted, so a membership's real number may be higher.
- **On your account:** with real receipts, Uber One's savings lines will show up once the re-read finishes.
  The line comes from the reader's `discounts` field, added in "Saved: notice what you used".

## Tests

| Suite | Result |
|---|---|
| Jest | 558 pass, including 7 new tests: what needs setting up, fees from receipts, the savings lines, credits left, totals |
| pgTAP | New `24_perk_setup` test (6 checks): saved, values checked, not for someone else's card, private, removed with the card. Full suite passes. |
| Browser | Home panel → screen → Done saves and the item disappears |

## To ship

```bash
git pull
npx supabase db push        # migration 000030 perk_setup
npx expo start --tunnel -c
```

No edge function changes.
