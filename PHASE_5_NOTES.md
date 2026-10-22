# Phase 5: Before you pay, Student mode, settlements

## What was built

### Before you pay (checkout stack)
**Home → Before you pay.** Type the store, e.g. "Courts", or tap one PerkScan already knows. PerkScan guesses what
you're buying from your last receipt there (or from the store's name), and you can change it. It then shows:

- **Pay with:** your cards, best first, each with its reasons:
  - **A card credit that applies at this store and still has money left** counts most, e.g. "Uber Cash: US$7 left
    this period". A credit whose amount isn't verified counts a bit less and says so.
  - **Protections for that kind of purchase:**
    - electronics → purchase protection, extended warranty, price protection
    - flights → trip delay and baggage
    - car rental → rental car cover
    - phone bill → phone protection

    Unverified terms are labelled "(terms not verified)".
  - **Currency:** whether the store charges in the card's currency (from your past receipts there). If not, it warns
    that the bank *may* add a foreign transaction fee. **No fee amount is shown, because none are verified.**
  - A card is only called **"Best choice here"** when a credit or protection actually sets it apart. Otherwise it says
    no card stands out.
- **Use with it:** your open promo codes, gift cards and store credit for that store.
- **What it doesn't do yet:** compare points or cash-back rates. They aren't in the card list, and PerkScan never guesses
  them. The screen says so.

### Student mode
- **Settings → I'm a student** (also in onboarding) turns it on. Home then shows **Student offers · N offers · M
  claimed**.
- **Student offers screen.** Each offer shows:
  - what you get, who qualifies and how to verify
  - a "Checked Oct 22, 2026" badge and where it's available
  - **Open offer**, which goes to the provider's own page
  - **I've claimed it**, which you can undo
- **The list** (`seed/student_discounts.json`) has 6 offers available worldwide. Each was checked on 2026-10-22 against
  the provider's own help or education pages:
  - GitHub Student Developer Pack
  - JetBrains free student licence
  - Figma for Education
  - Notion Plus for students
  - Autodesk Education
  - Microsoft 365 Education
- **No prices** are listed: they change and differ by country.
- **Left out on purpose:** Spotify and Apple Music student plans, and the ISIC card. I couldn't confirm they're offered
  in Trinidad & Tobago, and I won't list something that may not be.
- **Offers limited to certain countries** show under "Not offered in …" if you live elsewhere.

### Settlements
- **A `settlements` table that only PerkScan maintains** (users can read it but not change it). Each settlement has:
  - name and description
  - the stores and products covered
  - the purchase dates covered and the claim deadline
  - the **official claim site**
  - the proof required, and the countries the class covers
  - the payout as officially stated
  - source and check date
- **How it's matched:** a receipt (or bank alert) from a listed store, dated within the purchase dates, and before the
  deadline, creates a **"Possible claim"** under Offers → Settlements. It:
  - says which purchase matched
  - lists what you need to check and what proof you may need
  - links to the official claim site ("PerkScan never files for you")

  Two exceptions: a country-limited settlement is skipped if your country isn't covered, and a closed one expires.
- **Payouts are never counted as money owed.** "I filed a claim" asks what you received, and you can leave it blank
  while you wait. "Not for me" dismisses it.
- **When matching runs:**
  - as soon as a new receipt is read
  - when the app opens
  - every hour on the server
- **The list starts empty.** I won't add a settlement without its official settlement site or court notice.
  - **How it gets filled:** I add verified ones to `seed/settlements.json` (the checks reject plain-http links, missing
    sources and bad dates), or you add a row in Supabase → Table editor → `settlements`.
  - **What to expect in T&T:** most class actions only cover US residents, and the matching respects that.

### Other changes
- **Placeholder tables:** Phase 1's empty `settlements`, `student_discounts` and `user_student_claims` tables were
  replaced with the shapes above. The migration stops with an error rather than drop one that has any rows.
- **Shared store-name matching:** the same matcher (e.g. "COURTS TRINIDAD" = "Courts") is now used by the server and
  the app (`supabase/functions/_shared/merchant.ts`).
- **Data files:** `npm run seed:build` now checks and builds all three: cards, student offers and settlements.

## Verified here
- **Unit tests (177):**
  - Before you pay ranking: a credit beats a protection; used-up and expired credits are ignored; currency alone never
    makes a card "best"; only that store's promos and credit are listed
  - guessing what you're buying
  - the student and settlement file checks
- **Database tests:** 7 files, 131 checks, 0 failures. The 16 new ones cover:
  - users can't add settlements
  - matching by store, dates, country and deadline (only the right one of 4 test settlements matches)
  - no duplicate claims, never counted as money, linked to the receipt and the official site
  - closed settlements expire
  - student claims are private, and you can't claim for someone else
- **End-to-end:** a new receipt matches a settlement the moment it's read.
- **Browser:**
  - Before you pay at Courts with Scotiabank ··4321 and an Amex Gold: Scotiabank is best (price protection, same
    currency); the Amex shows purchase protection plus a currency heads-up.
  - Student offers, with claiming one.
  - A locally added test settlement shows up as a possible claim for the Courts purchase. It has been removed again.

## Your setup (VS Code terminal)
1. `git pull`. If it complains about `supabase/seed.sql` again, run `git checkout -- supabase/seed.sql` first.
2. `npx supabase db push`
3. Load the student offers: `npx supabase db push --include-seed`. If they don't appear, paste `supabase/seed.sql` into
   Supabase → SQL Editor → Run, like last time.
4. Redeploy both functions (settlements now match on arrival):
   - `npx supabase functions deploy ingest --no-verify-jwt --use-api`
   - `npx supabase functions deploy process-inbox --use-api`
5. `npx expo start --clear`

No new env keys.

## What to test
- [ ] Home → **Before you pay** → type a store you've bought from (e.g. Courts or Uber Eats). The cards are ranked with
      reasons, and any codes or store credit for that store appear.
- [ ] Change "What are you buying?" (e.g. Electronics vs Groceries). The protections shown change.
- [ ] Settings → **I'm a student** on. Home shows Student offers. Open one, tap **Open offer**, and mark one **claimed**.
- [ ] Offers → Settlements stays empty until a verified settlement is added. That's expected.

## Known limits
- No points or cash-back comparison (no verified earn rates yet). Scotiabank's terms are still unverified too.
- Settlements are matched by store name and dates only. The products and whether you're in the class still need your
  own check, which the steps say.
- The student list is short and global on purpose. If you study at a T&T school with its own deals, send them to me with
  links and I'll add them.

*PerkScan informs and guides. It does not file claims, sign you up for offers, or give financial or legal advice.*
