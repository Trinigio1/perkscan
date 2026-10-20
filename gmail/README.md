# Connect Gmail to PerkScan (free)

PerkScan reads only emails **you label `PerkScan`**. A small Google Apps Script in your own Google
account sends those emails to PerkScan every 10 minutes. No domain, no paid service.

## 1. Get your token (phone)
PerkScan app → **Settings → Connect Gmail → Create token**. Copy the token and the URL it shows.
The token is shown once; if you lose it, create a new one and revoke the old one.

## 2. Add the script (computer)
1. Go to <https://script.google.com> → **New project**.
2. Delete the sample code and paste the contents of [`PerkScan.gs`](PerkScan.gs).
3. At the top, paste your URL into `PERKSCAN_URL` and your token into `PERKSCAN_TOKEN`. Click **Save**.
4. In the function dropdown pick **testPerkScan** → **Run**.
   Google asks for permission. It will say the app isn't verified — that's expected for your own script:
   **Advanced → Go to (project name) → Allow**.
   The log should say "It works!", and a test coupon appears in PerkScan → Offers.
5. Pick **installPerkScanTrigger** → **Run** once.

## 3. Label the right emails automatically (Gmail filter)
Gmail → search bar → **Show search options** (the sliders icon) → in **Has the words** paste:

```
subject:("order confirmation" OR "your order" OR receipt OR "gift card" OR "store credit" OR "promo code" OR "% off" OR coupon OR "free trial" OR "trial ends" OR "points expire" OR "rewards" OR settlement)
```

**Create filter** → tick **Apply the label: PerkScan** (create it) → optionally tick
**Also apply filter to matching conversations** → **Create filter**.

You can also label any email `PerkScan` by hand.

## Good to know
- Only the cleaned text of labeled emails is sent. Links are removed and full card numbers are masked
  before anything is stored. PerkScan deletes the email text as soon as it's been read (24 hours at most).
- The text is sent to Anthropic's Claude API to pick out codes, amounts and dates.
- To stop: run **uninstallPerkScanTrigger**, and revoke the token in the app.
- Emails older than 60 days are skipped. Up to 10 emails are sent per run.
