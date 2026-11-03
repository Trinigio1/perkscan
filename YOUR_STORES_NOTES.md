# Your stores

PerkScan finds the stores you spend at most and lists, for each one, everything you already have there. It combines every source it reads:
- email receipts, card alerts and the bank;
- the store's own emails, and your card company's emails;
- your cards' and memberships' terms;
- the stores' own websites.

Every item says where it came from and has "Wrong?".

## Where people see it

- **Home:** a "Your stores" card under Money moves. It shows how many things you have at your top stores, the money ready to use there, and what the right card would have earned. If there are no purchases yet, it explains what's needed.
- **Your stores screen** (`/stores`, also Explore → "Your stores"):
  - a summary: things you have, money ready to use now, and earnings missed in the last 6 months;
  - "Your card apps have offers too": Amex Offers, BankAmeriDeals, Chase Offers and so on, but only for issuers you hold cards from;
  - one panel per store. It shows visits, spend per currency, the last purchase, and "$X ready to use". Up to 4 items are shown, then "Show all".
- **Each item:** a title, details, "From: …", an end date if there is one, the stated amount, and actions:
  - "Open", for an offer or credit;
  - "Join free" / "See the policy" / "Open", for the official page;
  - "I'm already a member", for free programs;
  - "Before you pay", on the card line;
  - "Wrong?", which saves the report under kind `store_item` with key `<store>:<item>` and the catalog id.

## What each store lists (`src/domain/stores.ts`)

Items appear in the order to use them.

| Item | From | Counts in "ready to use" |
|---|---|---|
| Gift card, store credit, travel credit | Your emails | Yes, the stated balance |
| Card credit that applies here (merchant match) | Your card's terms, minus what you've used | Yes, what's left this period |
| Codes from the store's emails, matched by store name **or by the email's domain** (`em.target.com` → Target) | Your emails | Only the best one (codes rarely combine) |
| Card offers your card company emailed | Your emails (issuer domains) | Yes, the stated amount |
| Deals on the store's own pages (the scout), still running and not hidden | The store's website | No (an offer, not money you hold) |
| Student prices (if you're a student) | The store's student page | No |
| Memberships of yours that work here | Membership terms | No |
| **Price adjustment window:** "Bought here Oct 31: if the price drops by Nov 14, ask for the difference" | The store's own policy + your purchase date | No |
| Free programs here you haven't joined | The program's website | No |
| The card that earns most here, and **what paying with another card cost you** | Card issuers' earn rates + your purchases | No |

**Rules**
- **Store ranking:** last 180 days. The score is visits plus up to 10 for spend (every 25 in the store's main currency), so one $900 trip counts too.
- **Not counted as stores:** bills, subscriptions and services.
- **One purchase, two records:** an email receipt and a bank alert for the same purchase count once (same store, amount and currency within 3 days). The copy that knows which card paid is kept.
- **Card statement names are cleaned:**
  - "SQ *", "TST*" and other payment-processor prefixes are removed;
  - store numbers and a trailing state are removed;
  - "STARBUCKS #1234 MIAMI FL" becomes Starbucks;
  - branches join under the plain name ("chipotlecoralgables" joins "chipotle").
- **Store names:** the catalog's spelling wins (McDonald's, not "Mcdonald's").
- **Currencies:** never added together.
- **Missed earnings:** only cash values issuers state, USD purchases, and no rates that need something at checkout. It's a floor, not a guess.
- **Hidden stores:** their codes and deals aren't shown here either. Your balances and credits still are.

## Catalog: 10 new programs, verified on official pages on 2026-11-03 (migration 047)

| Program | What the official page says |
|---|---|
| **BankAmeriDeals** (Bank of America cardholders) | Cash back offers on top of card rewards; most must be activated first |
| Club Publix | Free; digital coupons; birthday treat (add your birthday ≥10 days before) |
| myWalgreens | Free; 1% Walgreens Cash, 5% on Walgreens brand; expires after 12 months |
| MyMcDonald's Rewards | 100 points per $1; points expire after about 6 months |
| Chick-fil-A One | Free; 10 points per $1; rewards from 200 points; reward points don't expire |
| Taco Bell Rewards | Free item on sign-up (14 days); 10 points per $1; 250 points per reward |
| Kohl's Rewards | 5% as Kohl's Cash in $5 amounts on the 1st; good for 30 days |
| Domino's Rewards | 10 points per $5+ order (one a day); 60 points = free medium 2-topping pizza |
| **Old Navy price adjustment** | Once, within 14 days; promo-code and Final Sale items usually excluded |
| **Home Depot price adjustment** | Within 30 days; marketplace and membership sites excluded |

**Left out:** Lowe's. Its page states no post-purchase window, and PerkScan doesn't invent one.

## Also changed

`checkoutStack` (Before you pay) now matches codes by the email's domain when the email didn't name the store.

## Tests

- **Jest (659 pass):** `stores.test.ts`, 12 tests:
  - ranking and big spends; the same purchase counted once; bills, refunds, old purchases and currencies;
  - statement-name cleaning; branches joined;
  - every item kind with its source and order; "ready to use" counting only the best code;
  - the price window date; card credits left;
  - missed earnings from stated values;
  - wrong and hidden items removed; catalog spelling;
  - card-app offers only for your issuers; totals.
- **pgTAP:** 348 ok.
- **Browser** (local stack): a test wallet (Amex Gold, BofA Premium Rewards, Uber One) with bank-style purchases (STARBUCKS #1234 MIAMI FL, PUBLIX #1543, CHIPOTLE 0921 CORAL GABLES FL…) and emails from target.com, em.target.com and americanexpress.com.
  - 7 stores, 11 things, $43 ready ($25 gift card + $10 code from em.target.com + $8 Amex offer at Publix).
  - Target and Old Navy windows with dates.
  - Club Publix, myWalgreens, MyMcDonald's and others.
  - "Wrong?" on the gift card hid it and Target dropped to $10.
  - No page errors.

## Limits

- It only knows purchases PerkScan sees. Card alerts often have no item lines, so price windows use the purchase date.
- Card-app offers live inside bank apps. PerkScan can't read them, so it points you there.
- The free-program catalog covers popular US chains. Stores outside it get everything else, just not a program line.

## Ship

```
git pull
npx supabase db push --linked
npx expo start --tunnel -c
```
