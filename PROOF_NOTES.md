# Proof (pillar 6 of 6): what PerkScan actually got you back, and from where

## What's new

All of this is additive: no layout moved.

### Monthly recap

- **Where it came from:** money that came back that month, by source (Refunds $669.23 · Gift cards $25 ·
  Codes $6.20…), with a count for each.
- **Spotted on receipts:** "1 spotted on your receipts by PerkScan, no tapping needed." These are the
  items PerkScan marked used by itself from a receipt.
- **Membership savings, kept apart:** "Also: your memberships saved $3.49 on 1 receipt." These are the
  membership's own savings lines on receipts. They're real, but they're the membership at work, not
  PerkScan, so they're **never in the total**.

### Money → Used

The same breakdown for the year, in one line under the total.

### Recap notification on the 1st

- **What it says:** on the 1st at 9:00, "Your October recap: at least $717.43 back", with the top three
  sources. Tapping it opens **last** month's recap.
- **When it fires:** only when something came back, so there's never a "$0" nudge.
- **Why "at least":** it's planned from what was known when the app last synced. Anything spotted on a
  receipt after that would only add to it.

## Honesty rules

| Rule | How it's kept |
|---|---|
| Only money marked used counts | Marked by you, or spotted on a receipt. Estimates, deals and "save up to" never count. |
| Items with no amount count nothing | Never an invented figure. |
| Currencies are never converted | Each currency is shown on its own. |

## Tests

| Suite | Result |
|---|---|
| Jest | 580 pass |
| New tests | Breakdown by source (biggest first, manual items labelled "Added by you", last month excluded); receipts count; one-line summary; recap notification (date, wording, route, none when $0); membership savings for one month |
| Browser | Recap: $700.43 split into Refunds / Gift cards / Codes, 1 spotted on receipts, Uber One's $3.49 shown apart. Money → Used shows the line. |

## To ship

```bash
git pull
npx expo start --tunnel -c
```

No database or function changes.
