# Review round 1: 30 emails checked by hand

## Result
- Marked right: 24 of 30. Of the 6 marked wrong, 4 were monthly Hollister summaries that looked like
  duplicates and couldn't be found in Gmail: the screens showed the day PerkScan received them during the
  catch-up (Oct 27), not the day they were sent. A display problem, not a reading one.
- Reading mistakes: 2 of 30 (≈ 93% right). No wrong dollar amounts.
  1. DoorDash "30% off 10 orders" code: no store shown, so it wasn't clear what it was for.
  2. DoorDash/Chipotle receipt: date one day late. The email's Date reached the reader in UTC, so an evening
     order in Miami looked like the next day.
- Also seen: a referral code meant for other people (Topstep) was listed as an offer.
- Reader versions: 19 of the 30 were read by the 2026-11-07 rules, none by the latest (2026-11-12, where codes
  work). Re-read after deploying to measure the current reader.
- Sample is small and mostly promos/newsletters (2 receipts, no card alerts): keep reviewing.

## Fixed
- Dates in the user's time zone: the reader sees the email's Date in the user's own zone (`localDateTime`),
  receipts and card alerts fall back to that local day (`localDay`), in-app deals too. Prompt 2026-11-13.
- Every offer names its store: when the email doesn't, it comes from the sender (`nameFromDomain`:
  doordash.com → DoorDash, lyftmail.com → Lyft, crumbl.com → Crumbl).
- Codes for other people ("your referral code gives new traders 15% off") aren't perks: left out.
- Review and "What PerkScan read" show when each email was **sent** ("Mar 4"), not when PerkScan got it.
- `eval/real/export_review.sql` now also exports the sent date and each offer's store.

## Next
"Prove every dollar": amounts, codes and dates only count when the reader quotes the email text that shows
them. Then measure again with the same export.
