# "This is wrong" and sources everywhere

A wrong item costs more trust than a right one earns. Two changes:
- people can say an item is wrong and it disappears for them straight away;
- every item says where it came from, so a wrong one can be traced.

## What people see

- **"This is wrong"** on:
  - subscriptions (labelled "Not a subscription?");
  - money moves;
  - perks on the Card perks screen;
  - non-credit benefits on a card's page.

  Tapping it offers reasons: *not mine*, *doesn't apply to me*, *wrong amount*, *expired*. Picking one hides the item, shows a toast, and refreshes.
- **Sources:**
  - Subscriptions show "From your bank / card alerts / email receipts".
  - Money moves show "From: …", e.g. "your phone bill email + your card's cell phone protection terms", or "U.S. CPSC recall list + your receipt".

## Data (migration 046)

- `wrong_reports`:
  - fields: kind, item key, reason, optional note (300 characters max), optional catalog ref;
  - catalog ref is a catalog id only, nothing personal;
  - one row per item; reporting again updates it.
- RLS: people read only their own rows. Nobody writes the table directly; writes go through:
  - `report_wrong`, which checks kinds, reasons, and the format of the catalog ref;
  - `undo_wrong`.
- `_quality_report(days)` is for the service role only. It returns counts by kind and reason, plus the catalog entries reported by the most people. It never says who reported or what their items were.
- The app loads the user's reports into `data.wrong`. Reported perks are removed from benefits, and subscriptions and moves filter themselves.

## For the team

```
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run quality:report        # last 30 days
… npm run quality:report -- 7                                           # last 7 days
```

How to use the report:
- Fix the top kind:reason groups first.
- Check each catalog entry several people reported against the issuer's official page.
- Analytics: `reported_wrong { kind, reason }`.

## Tests

- pgTAP `34_wrong_reports` (7 checks):
  - reports work for each item kind;
  - reasons are checked;
  - the table is never written directly;
  - you only see your own;
  - the report isn't available to users;
  - the team sees an entry two people reported, but not who.
- Totals: 348 database checks pass, 647 Jest tests pass, and tsc and eslint are clean.
