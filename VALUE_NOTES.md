# More value: estimates, deals worth, wider Gmail search, read report, TT

## Ready to use stays real money; estimates get their own lines
- **Percent-off codes** are worth that percent of what you usually spend at that store: the median of your receipts there in the last 12 months, in one currency. For example, 20% off at Nike, where your orders were $80 and $60, is about $14.
- **No estimate** is made when:
  - the store isn't on your receipts;
  - the code's minimum spend is above your usual spend;
  - the offer already has a stated amount.
- **Where estimates show:**
  - Offer rows show "≈ $14".
  - The offer screen explains the estimate: "20% of the $70 you usually spend at Nike (2 orders this year). Not added to Ready to use."
- **Home hero has two new lines** under the big number, each its own button:
  - "+ ≈ $23 in discounts · 3 codes" opens Money. Codes that can't be estimated are counted, with "up to 40% off".
  - "+ ≈ $73 in deals for you · 8 deals" opens Deals. It covers only deals matched to you. Each is counted as its stated amount off (if its minimum spend fits what you usually spend) or as a percent of your usual spend there.
- **The reader now saves `percent_off` and `min_spend`** on each offer (migration `20261102000015`). It also back-fills the percent for older offers from their description.
- Code: `src/domain/estimate.ts`, tested.

## Gmail: promotions from stores you buy from
- Once a day, the script lists the senders of the receipts in your Gmail: up to 25 store domains. Banks, payment processors and mail providers are left out.
- It also sends those stores' Promotions-tab emails from the last 30 days, but only ones mentioning a saving (off, code, coupon, reward, free, sale, deal, gift card, birthday).
- `previewPerkScan` prints the store list.
- The privacy text and Gmail guide now describe what the script sends.

## "What PerkScan read" (formerly Inbox)
- A summary: messages read, offers found and their stated worth, and how many had something to use, were receipts, had nothing, or failed.
- Each message says what was found, or why nothing was ("A promotion with no code, amount or end date to act on").
- Reachable from Home → Explore and from Settings.

## Trinidad & Tobago
- **Scotiabank No Fee Visa Classic:** emergency services through Visa were confirmed on the bank's page (benefit now verified). The card itself stays unverified: its annual fee when you spend less than TT$1,250 a month isn't on the current page, and PerkScan never fills in a fee it can't confirm.
- **New deal sources:** Massy Stores' special offers and promotions pages. robots.txt is checked on every read.
- **Not added:**
  - Courts stays off, because its robots.txt disallows automated reading.
  - KFC T&T was left out because no official promotions page could be found.

## To ship
1. `npx supabase db push` (migrations 000015 and 000016). Run it before deploying the functions.
2. `npx supabase functions deploy ingest process-inbox scout`
3. Paste the updated `gmail/PerkScan.gs` into Apps Script, then run `previewPerkScan` to see your store list.
