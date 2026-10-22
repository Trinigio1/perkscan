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

## Update: the $0 on Home, and your school

### Why Home said $0, and what it shows now
"Left on the table" only counts money that **expired unused** this year. For a new account that's usually $0, for good
reasons:
- **The card has no statement credits.** The Scotiabank Visa Classic has none in PerkScan, so nothing on it can expire
  unused. Its protections are coverage, not cash.
- **Unverified credit amounts count as $0** rather than a guess.
- **Offers only count if they state a dollar amount** and then expire unused.

Home now does two things:
- **When nothing has been missed yet,** the big number shows what's **ready to use** (for example "TT$10 · Nothing left
  on the table in 2026 — yet").
- **A "Why is left on the table $0?" section** lists the actual reasons for *your* account, with links to fix them:
  add cards, connect Gmail, see credits, see offers.

PerkScan still never estimates money it doesn't know about.

### Pick your school (Student mode)
- **Student offers → Your school.** The list is the 12 institutions on the Accreditation Council of Trinidad and
  Tobago's list of accredited institutions (`seed/universities.json`, checked 2026-10-22). There's also a "My school
  isn't listed" option.
- **Offers are grouped:**
  - **From your school:** perks only for that school's students
  - **For students everywhere**
  - **Not available in Trinidad & Tobago:** shown with the reason, and with no claim button
- **UWI St. Augustine perks**, from UWI's own pages:
  - **Microsoft 365 through UWI:** every St. Augustine student has an Office 365 account.
  - **Pelican Perks:** discounts at partner businesses with a valid UWI student ID.
- **Amazon Prime Student** is listed under "Not available in Trinidad & Tobago". It's only for students at schools in
  countries where Amazon offers it (e.g. UK and Ireland), so a T&T school doesn't qualify. Its exact country list
  isn't confirmed, so it's marked "Not verified".
- **More school perks:** I'll only add a school-specific perk from an official page. If you know one (UTT, USC,
  COSTAATT…), send the link.
- **Tests:** 5 new database tests (users can read the school list but not change it, you can set your own school, and
  only real schools are accepted) and unit tests for the grouping and the $0 reasons.

### Setup for this update
1. `git pull`. If it complains about `supabase/seed.sql`, run `git checkout -- supabase/seed.sql` first.
2. `npx supabase db push`
3. `npx supabase db push --include-seed`, or paste `supabase/seed.sql` into the SQL Editor and run it.
4. `npx expo start --clear`

The functions don't need redeploying for this update.

## Update: United States schools and student perks

PerkScan already handled the US: the United States (USD) is a country choice, US time zones are detected, and the 10 US
cards are in the card list. This update adds US schools and US student perks.

### US schools
- **2,349 US colleges**, each with its email domain (e.g. University of Florida → ufl.edu). They're in
  `seed/universities_us.json`, which is built by `npm run schools:us`.
- **Where the list comes from:** I couldn't reach the Department of Education's servers from my machine. The list
  comes from the community-maintained **Hipo university-domains-list** on GitHub, which is widely used but **not an
  official list**. The file says so.
- **To switch to the official list:** on your PC, get a free key at https://api.data.gov/signup, then run
  `npm run schools:us -- --scorecard YOUR_KEY` and `npm run seed:build`. That rebuilds the list from the US
  Department of Education's College Scorecard (operating, degree-granting schools). This mode is written and unit
  tested, but **I couldn't run it here**.
- **Searching:** the app no longer downloads the whole list. In the US you type at least 2 letters, and the search
  matches the name or website ("ufl" finds the University of Florida). The short T&T list still shows in full.
- **Your school email:** once you pick a school, Student offers says which email most offers verify with (e.g.
  "@ufl.edu").

### US student perks (checked 2026-10-22 against official support pages; no prices)
- **Spotify Premium Student, with Hulu (With Ads) included in the US.** For students 18+ at a US Title IV accredited
  school, checked by SheerID.
- **Apple Music student subscription, with Apple TV+ included.** Checked by UNiDAYS or SheerID, up to 48 months.
- **YouTube Premium student membership.** At a SheerID-approved school, up to 4 years.
- **Adobe Creative Cloud for students.** Accredited school; a school email or proof of enrolment.
- **Amazon Prime Student.** Shown for US, UK and Ireland students, but marked **Not verified**: I only found blog
  sources, not an Amazon page.
- **Left out:** Apple education pricing, because no official page came up.
- **Where they show:** these appear for US users under "For students in United States". For T&T users they show
  under "Not available in Trinidad & Tobago".
- **School-specific perks for US schools aren't listed:** there are thousands, and I'll only add one from the school's
  own page. Send links for schools you care about.

### Setup for this update
1. `git pull`. If `supabase/seed.sql` blocks it, run `git checkout -- supabase/seed.sql` first.
2. `npx supabase db push`
3. `npx supabase db push --include-seed`. `seed.sql` is now about 1.9 MB because of the school list, so this is
   easier than pasting it into the SQL Editor.
4. `npx expo start --clear`

No functions need redeploying.

## Fix: no schools showing

**Cause:** the schools (and student offers) were only in `supabase/seed.sql`, which loads only with `--include-seed`.
On a hosted project that step can silently do nothing, which is why the Scotiabank cards needed the SQL Editor
earlier. The seed file is now 1.9 MB, too big to paste comfortably.

**Fix:**
- **The reference data now comes in a migration** (`supabase/migrations/20261027000002_catalog_data.sql`, generated by
  `npm run seed:build -- --migration`), so a plain `npx supabase db push` loads it. It covers cards, schools, student
  offers and settlements. It only adds or updates rows, so running it more than once is safe.
- **The school picker explains itself.** If the list isn't in the database, it says so and gives the command to run.
  A search with no results says "No schools match …", and errors are shown instead of a blank screen.

**What to do:** `git pull`, then `npx supabase db push`, then reopen Student offers → Your school.

*PerkScan informs and guides. It does not file claims, sign you up for offers, or give financial or legal advice.*
