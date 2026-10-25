# Finding more of what you already have (2026-10-25)

## 1. Cards you have but haven't added
Your inbox shows which cards you carry. PerkScan now notices them and asks **"Is Chase Freedom Unlimited ·· 4821 yours?"**
- **Add it:** opens Add cards with the card and its last 4 digits already filled in, so it's one tap.
- **Pick the card:** when the email didn't name the card ("your Card Account ending in 1007"), you choose from that issuer's cards only.
- **Not mine:** hides it for good.

**Where it shows:**
- on Home (with "N more")
- at the top of Your cards
- on the "We found $X" screen

**How cards are spotted:**
- **The reader:** it now notes the issuer, the card's name as written, and the last 4 digits when an email is from a card issuer about your own card. That covers statements, payment due or received, autopay, card alerts and benefit emails.
- **Bank alerts:** these already arrive from a known issuer domain (chase.com, americanexpress.com, aexp.com, capitalone.com, citi.com, discover.com, wellsfargo.com, bankofamerica.com, usbank.com, barclays, synchrony, Scotiabank, First Citizens, Republic Bank). They count even when the alert doesn't name the bank.
- **Ignored:** store emails ("your Visa ending 1234") and card ads ("Apply for the …").
- **Past alerts:** bank alerts PerkScan already read are back-filled when you push the database update.

**Matching a name to the catalog:**
- Every word of the name must be in the card's name.
- When several fit, the shortest name wins: "Platinum Card" is the Amex Platinum, not the Delta Platinum.
- If it's still a tie ("Freedom" could be Unlimited or Flex), PerkScan asks you to pick rather than guess.

**Privacy:** only issuer, name and last 4 digits are kept. The database refuses anything longer than 4 digits. Only you can see your spotted cards, and only the email reader can record them. They're included in your data export and deleted with your account. The privacy policy says so.

## 2. Travel credits and certificates
- **Travel credits** (new type): airline eCredits, future flight credits, trip credits, travel bank funds, travel vouchers.
  - They count as money, like store credit, with the credit number and the use-by date.
  - They show under a new **Travel credits** filter in Money and in "We found $X", and Claim opens the airline's site.
  - **Cancelled US flights:** if the email says the credit was issued because the airline cancelled or changed the flight, US users also see "If you didn't choose this credit, US rules say you may be owed a cash refund instead", with the DOT link (from the verified refund rule).
- **Certificates** (new type): free night awards, companion certificates and fares, upgrade certificates.
  - They're tracked with their use-by date and reminders, with no dollar value unless one is stated.
  - They sit with Points & miles.

## 3. Gmail script searches more
New searches:
- travel credits and vouchers
- free-night and companion certificates
- statements and payment notices from card issuers

Each email is still sent once.

**To pick these up you must update the script** (see `gmail/README.md` → "Updating the script"): paste the new `PerkScan.gs`, put your URL and token back, and run **scanPastYear** once.

## Accuracy checks
- **Reader tests:** cards (issuers, domains, store emails ignored, 4-digit limit), travel credits and the DOT note, certificates.
- **Matching tests:** run against the real card catalog.
- **Database tests:** privacy, writes, "Not mine".
- **End-to-end test:** a Chase statement and an airline eCredit going through the real pipeline.
- **5 new test emails** in `eval/cases`: eCredit, free night, Chase statement, Amex payment notice, and a card ad that must *not* count.
  - Run `npm run eval` with your Anthropic key to measure the real reader on them.
- **Updated expectation:** an older test now expects a $23.50 Uber order to use the Amex Gold's full $10 Uber credit (verified last update), not $23.50.

## Your setup
1. `git pull`
2. `npx supabase db push` (new types, card sightings, back-fill of past alerts)
3. `npx supabase functions deploy ingest process-inbox` (the reader changes)
4. Update the Gmail script and run **scanPastYear** once.
5. `npx expo start --tunnel -c`
