# US cards and "We found $X" (2026-10-25)

## US card catalog

**Before:** 10 US cards, 76 benefits, 72 of them unverified (counted as $0).
**Now:** 30 US cards, 122 benefits, 107 verified. 15 benefits and 3 annual fees are still unverified.

### How it was checked
- **Source:** each issuer's own pages, read through web search limited to the issuer's domain (americanexpress.com, chase.com, capitalone.com, citi.com, discover.com, apple.com, wellsfargo.com, bankofamerica.com, target.com). The build environment can't open the bank sites directly.
- **Rule:** a benefit is verified only when the issuer's page gives the amount and how often it resets. If pages disagree, or a figure only appears in an old document, it stays unverified with a note saying what was found.
- **Test:** `seedSchema.test.ts` checks that every verified US card and benefit links to that issuer's own site.
- **Re-check:** bank pages change, and some were months old. Re-check before a public launch.

### Updated existing cards
- **Amex Platinum ($895):**
  - Uber Cash $15/month ($35 in December)
  - Resy $100/quarter
  - lululemon $75/quarter
  - Digital entertainment $25/month
  - Hotels $300 per half-year
  - Airline fees $200/year
  - Walmart+ $12.95/month
  - Global Entry $120
  - New: Uber One $120/year, Equinox $300/year, Oura $200/year
  - Protections: purchase $10,000, 90 days; extended warranty; return $300/item; trip delay $500; trip cancellation $10,000; phone $800
- **Amex Gold ($325):**
  - Uber Cash $10/month
  - Dining $10/month (Grubhub, Cheesecake Factory, Buffalo Wild Wings, Five Guys, Wonder)
  - Resy $50 per half-year
  - Dunkin' $7/month
  - Protections: purchase, warranty, baggage, rental car
- **Chase Sapphire Reserve ($795):**
  - Travel $300 per account year
  - Exclusive Tables $150 per half-year
  - StubHub $150 per half-year
  - DoorDash up to $35/month (from Oct 1, 2026)
  - Lyft $10/month (to Sep 30, 2027)
  - Peloton $120/year
  - Global Entry $120
  - Travel protections with limits
- **Chase Sapphire Preferred ($95):**
  - Chase Travel hotel $100 per account year
  - DoorDash $10/month, plus DashPass
  - Travel protections and extended warranty
- **Capital One Venture X ($395):**
  - Travel $300 per account year
  - 10,000 anniversary miles
  - Global Entry $120
  - Primary rental car coverage
  - Phone protection $800
- **No annual fee:** Savor, Freedom Unlimited, Discover it, Apple Card. Their perks are now verified.
- **Citi Strata Premier ($95):** $100 hotel benefit, plus travel protections (no limits stated).

### 20 new US cards
- **American Express:**
  - Blue Cash Preferred: Disney $10/month
  - Blue Cash Everyday: Home Chef $15/month and Disney $7/month
  - Green
  - Delta SkyMiles Gold: Delta Stays $100
  - Delta SkyMiles Platinum: Delta Stays $150, rideshare $10/month, Resy $10/month
  - Hilton Honors Surpass: Hilton $50/quarter
- **Chase:**
  - Freedom Flex: phone protection $800
  - Prime Visa
  - United Explorer: rideshare $5/month, United Hotels $100
  - Marriott Bonvoy Boundless
- **Capital One:** Venture (Global Entry $120), Quicksilver
- **Citi:** Double Cash, Custom Cash, Costco Anywhere Visa (the yearly reward certificate expires Dec 31)
- **Wells Fargo:** Active Cash, Autograph
- **Bank of America:** Customized Cash Rewards, Premium Rewards (airline fees $100/year, Global Entry $100)
- **Target Circle Card:** 5% off, 30 extra days for returns

**Spend-based rewards** (the Delta $200 flight credit, the Hilton free night, the United $100 travel credit) are listed as perks, not counted as money. You only get them after spending a set amount.

### Still unverified (shown as "Check", counted as $0)
- **Amex Platinum:** Saks (may have ended), CLEAR+ (Amex pages say $209 or $219), car rental limits
- **Amex Green:** CLEAR+ ($209 vs. $219)
- **Sapphire Reserve:** The Edit (unclear whether it resets each half-year or each account year), Apple TV+/Music (only in a 2025 press release), purchase protection and warranty limits
- **Sapphire Preferred:** purchase protection (Chase's page says both 120 and 90 days)
- **Venture X:** trip delay, trip cancellation, purchase protection, warranty (only old guides give limits)
- **Citi Strata Premier:** extended warranty
- **Annual fees:** Wells Fargo Active Cash and Autograph, Bank of America Customized Cash; also Active Cash phone protection

### Other changes
- **Card perks grouping:** perks now sort into sensible groups (checked bags and club passes under "At the airport", elite status and free nights under "Status").
- **Migration `20261102000004_peloton_yearly.sql`:** removes the old, never-used monthly Peloton rows, because that credit is now tracked yearly.

## "Last checked" dates
Verified benefits now show "Checked Oct 25, 2026 on the issuer's site" on:
- the card screen
- the credit screen
- Your card perks

## "We found $X"
- **When it opens:** after setup, the first time PerkScan has something to show, the new screen `src/app/found.tsx` opens by itself once.
- **What it shows:**
  - The big number: open money PerkScan can stand behind, per currency.
  - Groups by kind (card credits, gift cards, codes…), biggest first, top 3 each, every row with its Claim button.
  - "+ N more to check": guesses and unknown amounts, never counted.
  - Purchases protected by your cards, mentioned but not added up.
  - What already expired unused this year.
- **On Home:** a "PerkScan found $X for you" card reopens the screen until it's hidden.
- **Logic:** `foundMoney()` in `src/domain/firstRun.ts`, which is tested.

## Activation tracking
- **New event:** `found_viewed`, with:
  - whether it's the first time
  - whether there was money
  - item and group counts (capped at 20)
  - how long after finishing setup, in buckets: under 5 minutes, under 30 minutes, same day, later
- **Privacy:** no amounts, stores or timestamps are sent. As with all events, it only sends when PostHog is configured and the user hasn't opted out.
- **Funnel to watch:** `onboarding_completed` → `found_viewed` (first) → `claim_started`.

## Your setup
1. `git pull`
2. `npx supabase db push`: loads the cards (`20261102000003_catalog_data.sql`) and the Peloton cleanup.
3. `npx expo start -c`, then open a card to see the new amounts and "Checked" dates.
