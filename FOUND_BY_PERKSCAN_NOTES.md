# Proof: what PerkScan found that you didn't know about

The point is to answer "is PerkScan worth $9.99 a month?" with real numbers, both for each user and for the team.

## The honest measure

Every time money comes back (a credit marked used, a refund that arrived, a discount seen on a receipt), PerkScan asks once:

> **You got $70 back. Did you know about it before PerkScan?**   [PerkScan found it] [I already knew]

- Only **"PerkScan found it"** counts as found. Unanswered money is never assumed to be PerkScan's.
- It's asked on Home, as one card in "Next up", newest first, for money from the last 45 days. The monthly recap lists anything still unanswered from that month, with the same two buttons.
- Stored on `recovered.knew_before` through `answer_knew_before(...)`. Users can only answer for their own recoveries and can never write the table directly.

## For users

- **Home: "November so far"** shows three figures:
  - **New for you:** money that became usable this month. That's credits that reset, refunds and price drops owed, and offers with an amount. Never guesses (anything tagged "Check" is left out) and never dismissed items.
  - **You used:** money marked used, or seen used on a receipt.
  - **PerkScan found:** the part you said you didn't know about.

  Tapping it opens the recap.
- **Recap: "Found by PerkScan"** shows new money, what you didn't know about, what you already knew about, and the questions left to answer.
- **Paying users** (`profiles.plan = 'plus'`) also see "Your PerkScan Plus plan paid for itself N× this month". That's found money in US$ divided by the plan's $9.99, shown only when something was found.
  - `plan` is set by the server only. The app can't change it (pgTAP checks this).
  - Billing isn't built yet, so nobody is on Plus today. When billing is added, its webhook should set `plan`.
  - The price lives in one place: `PLAN` in `src/domain/monthValue.ts`.

## For the team

```
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run metrics:value            # this month
… npm run metrics:value -- 2026-11 --price 9.99                               # a given month and plan price
… npm run metrics:value -- 2026-11 --json                                     # raw numbers
```

`_value_report(month, plan_price)` runs on the service role only, returns aggregates only, and counts onboarded people only. It reports:

- **New money put in front of people:** median, mean and middle half per person, and how many had any.
- **Money people actually used:** median and mean.
- **Found by PerkScan:** median and mean; the share of people who got **at least the plan price** in money they didn't know about; the share who got **3× or more**.
- **"Did you know?" answers:** how many said found, already knew, or didn't answer, and the share of answered recoveries that were new to people.
- **New money and found money by kind:** refunds, price drops, card credits and so on, to show where the value actually comes from.

These figures are in US dollars only; items in other currencies are counted but not converted.

**What to watch in the beta:**
1. **The share of people whose found money is at least $9.99.** That's who a $9.99 plan is clearly worth it for.
2. **The share of answered recoveries that were new to people.** This is the incrementality rate.
3. **Median found money.** If the median is well below the mean, a few big wins are carrying the average.

## Code

- `supabase/migrations/20261103000042_found_by_perkscan.sql`: the `knew_before` column, `answer_knew_before`, `profiles.plan`, `_value_report`.
- `src/domain/monthValue.ts`: `monthValue`, `knewQuestions`, `becameUsable`, `PLAN`.
- `src/components/MonthValue.tsx`: `useMonthValue`, `MonthValueCard`, `KnewCheck`.
- Wired into `NextUp.tsx` (the question), Home (the card), and `recap.tsx` (the section, unanswered items, the plan line).
- `src/lib/inbox.ts`: `answerKnewBefore`. `src/lib/data.tsx` loads the answers, and still works against a database without them.
- `scripts/value-report.ts`: `npm run metrics:value`.
- Analytics: `knew_before { answer: found | knew }`.

## Tests

- **Jest (626 pass):** `monthValue.test.ts` checks:
  - new money is counted by when it became usable, leaving out guesses, dismissed items and older months;
  - used money is split by the answer;
  - "paid for itself" counts only found money, and never shows at $0;
  - the question picks recent, unanswered money where the database supports answers.
- **pgTAP (322 ok):** `31_found_by_perkscan.test.sql` checks:
  - you answer only for your own recoveries;
  - nobody writes the table directly;
  - the app can't set its plan;
  - users can't run the team report;
  - the report counts only "found" answers, leaves out guesses and older items, and tallies answers.
- **Browser** (local stack, test user with a $70 price drop and $10 Uber Cash used):
  - Home asked about the $10;
  - "PerkScan found it" saved `knew_before = false`;
  - the recap showed "You didn't know about $10" and still asked about the $70;
  - with `plan = 'plus'` it read "Your PerkScan Plus plan paid for itself 1× this month";
  - no page errors.

## Ship

```
git pull
npx supabase db push --linked
npx expo start --tunnel -c
```
