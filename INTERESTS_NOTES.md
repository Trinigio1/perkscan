# Deals by interest, and finding more in email

## Deals for you, by interest
- **Tagging.** Every deal is tagged with what it's about, from three things, most certain first:
  1. The category it was filed under.
  2. What the store is known for: about 400 well-known US and Trinidad stores, e.g. Planet Fitness → fitness, Sephora → beauty, Nike → fitness and fashion.
  3. Clear words in the title, e.g. "yoga class" → fitness.

  Store names match as whole words only, so "Clearance Outlet" isn't CLEAR and "Applebee's" isn't Apple. "Everything else" is never used as a tag when something more specific fits. See `src/domain/interests.ts`.
- **Ranking.** A deal matches an interest you picked if any of its tags does, not only its category. A Nike shoe deal now reaches people into fitness.
- **Interests learned from receipts.** These now use what the store is known for: a Planet Fitness charge counts as fitness, not "subscription". A store known for several things (Courts) follows what was bought.
- **Deals tab.**
  - A chip row: All, plus one chip per picked interest with a count.
  - All view: a section per interest, each showing the top deals plus the soonest offer from your own email about it.
  - Tapping a chip shows everything for that interest, both from your email and near you.
  - Each deal shows its tags. The rest of the tab (Coming up, More near you) is unchanged.

## Finding more in email
- **New reader rules** (prompt version `2026-11-03`):
  - Rewards a store already issued count as money, with their use-by date: Kohl's Cash, ExtraBucks, "your $10 reward is ready", reward certificates.
  - Free-item rewards (birthday drink, free entrée) are kept as offers without a dollar value.
  - Running points and cash-back balances, and "spend $X to get $Y", are not counted. This avoids double-counting a monthly balance and inventing money.
- **Interest tag.** The reader tags each email with an interest (`opportunities.interest`, migration `20261102000014`). Older offers fall back to the store/word tagger.
- **Gmail script.** It now also searches for issued rewards, store cash and birthday treats.
- **Accuracy checks.** Four new eval cases: Kohl's Cash, birthday drink, a cash-back balance that must not count, and a gym promo tagged fitness. The scorer now checks `interest` when a case sets it.

## To ship
1. `npx supabase db push` (migrations 000012–000014). This must run before deploying the functions.
2. `npx supabase functions deploy ingest process-inbox`
3. Paste the updated `gmail/PerkScan.gs` into your Apps Script project.
4. `npm run eval` with your key, to measure the new rules.
