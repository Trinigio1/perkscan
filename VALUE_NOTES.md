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

## Fix: emails failing with "The compiled grammar is too large"
- **What happened.** Adding the interest tag made the reader's answer format have 5 optional fields, up from 4. The API compiles that format into a grammar, and each optional field makes the grammar much larger. 5 was over the limit, so every email failed until this fix (98 of 166 in the first real report).
- **The fix.** The model is now asked for `ModelOutputSchema`: the same fields, all required (null when missing), with interest and alert status as plain strings. These are checked afterwards in `normalizeParsed`. A test fails if an optional field is ever added again.
- **Re-reading what failed.** A failed email's text is deleted within 24 hours, so it has to be sent again. Ingest now re-queues a re-sent email that failed before; ones already read stay duplicates, at no AI cost. The Gmail script's new `resendUnread` sends the last 12 months again.
- **Why an email gave nothing.** The reader writes a note on each message (`inbound_messages.read_note`, migration `20261102000017`): already found in an earlier email, expired before it arrived, no code/amount/end date, or a trade-in/reward for doing something. "What PerkScan read" shows the note, and shows failures in plain words.
- **Trade-in offers** are left out entirely. Existing ones are dismissed.
- **Rewards for doing something** (an interview, a survey, "unlock by completing 5 tasks") never count as money. Existing ones lose their amount.

To ship:
1. `npx supabase db push`
2. `npx supabase functions deploy ingest process-inbox`
3. Paste the new script into Apps Script and run `resendUnread`.
