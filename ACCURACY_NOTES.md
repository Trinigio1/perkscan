# Accuracy tracking (between Phase 4 and Phase 5)

The goal is to know how far to trust what PerkScan reads from your emails and texts before building more on top of it.
There are two ways to measure that:

1. **In the app:** you check what PerkScan read from your real messages, marking each one right or fixing what's wrong.
2. **A test set in files:** a fixed list of example messages with known right answers. It's re-run against the real
   reader whenever the reader changes, so you can see whether it got better or worse.

## 1. In the app

- **Settings → Reading accuracy** (or **Inbox → Check what PerkScan read**) shows your accuracy, e.g. **"89% read
  right"** with "16 of 18 you checked". It also lists the most common mistakes, such as "Expiry date · 3".
- Below 10 checks it says how many more you need before the number means much.
- **To check** lists each email or text with what PerkScan took from it, one line per item, for example:
  *Bank alert · Uber Eats · TT$144.51 · card ••4321 · 2026-10-21 · pending*
  - **Right** records it as correct.
  - **Something's wrong** lets you tick what was wrong and type the right value. The choices are:
    - not a real offer
    - amount, code, expiry date, store name, currency
    - card digits, purchase date
    - wrong type of message
    - missed something
    - something else

    **Your fix is applied to the item itself**, including the "what to do" steps. A corrected card ending re-matches
    the purchase to the right card. "Not a real offer" removes it from your offers.
- **Every offer from an email or text** has a "Did PerkScan read this right?" box with **Yes** / **No, fix it**.
- You can change your answer later. Each message has one review.

**Privacy:** a review stores only the verdict, what was wrong, and the corrected values (amount, code, dates, store,
card last 4). Never the email or text, which is already deleted. The optional note says not to include personal
details and is capped at 280 characters. Reviews are private to you (RLS) and are deleted with the message.

**Reader version:** every message now records which reader read it (e.g. `claude-haiku-5-5/2026-10-23`), and so does
each review. When the prompt or model changes, accuracy can be compared before and after.

## 2. The test set (`eval/`)

- `eval/cases/*.json`: one message per file, with the right answer. It starts with **14 made-up cases**, marked
  `"origin": "synthetic"`:
  - your Scotiabank alert wording (pending), an approved local purchase and a declined charge
  - TT$ and US$ amounts, and "$144.51 TTD" style amounts
  - a promo with a date, a promo with "expires in 7 days", a gift card, store credit and a free trial
  - a US receipt with a return window, an Uber Eats TT$ receipt, and a settlement
  - a newsletter with nothing in it, a bmobile TT$ text promo, and a flight booking whose confirmation code must not be
    mistaken for anything
- Only the fields listed in `expected` are checked. Stores are matched loosely ("COURTS TRINIDAD" counts as "Courts"),
  and amounts to the cent.
- The scorer is unit-tested (`eval/__tests__/score.test.ts`).

**Run it** (Windows PowerShell, in the project folder). It uses the real Claude reader and costs about **US$0.01 for
all 14 cases**:
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-…"   # only for this terminal window; it's not saved anywhere
npm run eval
```
- To run only some cases: `npm run eval -- alert` runs the files with "alert" in the name.
- It prints ✓/✗ per case, what was wrong, and a per-field table (worst first).
- The full results go to `eval/results/`, which isn't committed because results can echo message text.
- Close the terminal afterwards so the key is gone.

**Add your own real examples.** These matter most, because made-up cases can't show how the reader handles real
emails:
1. Copy a file in `eval/cases/`, e.g. `alert-scotia-pending.json`, to a new name.
2. Paste the email or text into `input.text`, and replace anything personal: your name, address, account numbers,
   card digits (use 0000) and order numbers.
3. Set `"origin": "real"` and fill `expected` with the right answer.
4. Commit it only if you're happy for it to be in the repository. Otherwise keep it local.

## Verified here
- 17 database tests:
  - you can't review someone else's message
  - reviews can only be written through the function
  - verdicts, the "what was wrong" list and corrections are validated, and unknown correction fields are refused
  - fixes are applied, including the steps
  - a new card ending clears the card link for re-matching
  - "not a real offer" dismisses the item
  - reviewing again updates the same review
  - the summary numbers are right
  - other users can't see your reviews
- Unit tests for the accuracy helpers and the scorer: 164 Jest tests in total.
- The end-to-end test now also checks that the reader version is recorded.
- In the browser: pasted a bank alert and a promo, marked the alert right, then fixed the promo's code. The offer, its
  steps and the accuracy (50%, "Code · 1") updated, and Settings shows the percentage.
- The test-set runner was run with a dummy key. It loads every case and reaches Anthropic's API; the API refused the
  dummy key, as expected.

**Not done here:** running the test set against the real reader. I don't have your API key, and it should stay out of
this chat. **So there is no measured accuracy yet.** The first real numbers will come from your run of `npm run eval` and
your in-app checks.

## Your setup (VS Code terminal)
1. `git pull`
2. `npx supabase db push`
3. Redeploy both functions, since the reader now records its version:
   - `npx supabase functions deploy ingest --no-verify-jwt --use-api`
   - `npx supabase functions deploy process-inbox --use-api`
4. `npx expo start --clear`

## What to do next
- [ ] Run `npm run eval` once and send me the summary table.
- [ ] In the app, check 20–30 of your real messages under **Settings → Reading accuracy**. Include several Scotiabank
      alerts, receipts and promos.
- [ ] Send me the accuracy screen, or just the percentage and the most common mistakes. Repeated mistakes are what I'll
      fix in the reader.
- [ ] Optional: add 5–10 anonymised real messages to `eval/cases/`.

**Messages read before this update** show under "before tracking" in the version breakdown. They can still be checked.
