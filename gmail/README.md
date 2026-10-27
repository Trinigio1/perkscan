# Connect Gmail to PerkScan (free)

A small Google Apps Script in your own Google account finds the emails PerkScan can use — receipts, bank alerts and card offers, school perks, subscriptions and renewals, loyalty balances,
promo codes, gift cards, store credit and rewards, expiring points, refunds, trials and settlement notices, plus
promotions from the stores your own receipts come from — and sends them to PerkScan every 10 minutes. No labels or filters to set up, no domain, no paid service.

Sign-in, password and verification-code emails are skipped, and so are social, forum, spam and bin.
Prefer to choose emails yourself? Set `AUTO_SCAN = false` in the script: then only emails you label `PerkScan` are sent.

## 1. Get your token (phone)
PerkScan app → **Settings → Gmail → Create token**. Copy the token and the URL it shows.
The token is shown once; if you lose it, create a new one and revoke the old one.

## 2. Add the script (computer)
1. Go to <https://script.google.com> → **New project**.
2. Delete the sample code and paste the contents of [`PerkScan.gs`](PerkScan.gs).
3. At the top, paste your URL into `PERKSCAN_URL` and your token into `PERKSCAN_TOKEN`. Click **Save**.
4. In the function dropdown pick **testPerkScan** → **Run**.
   Google asks for permission. It will say the app isn't verified — that's expected for your own script:
   **Advanced → Go to (project name) → Allow**.
   The log should say "It works!", and a test coupon appears in PerkScan → Money.
5. Pick **installPerkScanTrigger** → **Run** once.

## 3. Look through the past year (optional)
Pick **scanPastYear** → **Run** once. It sends the last 12 months of useful emails, newest first, a few batches every
10 minutes (PerkScan takes up to 200 emails an hour), and stops by itself when it's done.
Want to see how many first? Run **previewPerkScan** — it counts without sending anything.

## Choosing emails yourself instead
Set `AUTO_SCAN = false` at the top of the script. Then label any email `PerkScan` (by hand, or with a Gmail filter) and
only those are sent. Labeled emails are always sent in automatic mode too.

## 4. A second Gmail account (e.g. where your bank alerts go)
Repeat steps 1–3 in the other account, with its own token:
1. In the app: **Settings → Gmail → Create another token** (it's named "Gmail 2").
2. Signed in to the *other* Gmail account, go to script.google.com and add the script again with the new token.
3. Run **installPerkScanTrigger** there too. Bank alerts are found automatically.

Both accounts then feed the same PerkScan. Revoking one token stops only that account. If the other account
belongs to someone else, ask them first, and filter so only your bank's alerts are sent.

## Good to know
- Only the cleaned text of matching emails is sent. Links are removed and full card numbers are masked
  before anything is stored. PerkScan deletes the email text as soon as it's been read (24 hours at most).
- The text is sent to Anthropic's Claude API to pick out codes, amounts and dates.
- To stop: run **uninstallPerkScanTrigger**, and revoke the token in the app.
- New emails from the last 2 weeks are checked every run; older ones only with **scanPastYear**.
- Reading costs about US$0.0006 per email on PerkScan's side, under a monthly cap; a year of a busy inbox is usually under a dollar.

## Updating the script
When PerkScan learns to find something new, the script's search list grows too:
1. Open your script at script.google.com, select everything, and paste the new `PerkScan.gs`.
2. Put your `PERKSCAN_URL` and `PERKSCAN_TOKEN` back in (they're in the app: Settings → Gmail).
3. Save, then run **scanPastYear** once so emails from the last 12 months that match the new searches get read too.
   Emails already sent are skipped (they carry the `PerkScan-sent` label).

**2026-10-25 update:** it now also finds airline and travel credits, free-night and companion certificates, and
statements and payment notices from card issuers, so PerkScan can spot cards you have but haven't added.
Only the issuer, the card's name and its last 4 digits are kept.

## Emails PerkScan couldn't read
If **What PerkScan read** in the app lists emails it couldn't read, open the script, choose **resendUnread** and click
Run once. It sends the last 12 months again; PerkScan reads only the ones it missed and skips the rest. Large
mailboxes take a few hours — it continues by itself every 10 minutes.

## After PerkScan's reader improves
Run **rereadAll** once. It sends the last 12 months again and PerkScan reads every email with its current rules —
offers it already had aren't added twice. It costs a little AI time per email and continues by itself every 10 minutes.

## Less noise
At most 3 promotional emails per store per week are read (receipts, bills and account emails always are). To stop a
store's promotions completely, open one of its offers in the app and tap **Hide all offers from …**; undo it in
Settings → Hidden stores.
