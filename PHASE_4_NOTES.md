# Phase 4: Text messages and bank card alerts

PerkScan can now read **texts** as well as emails: bank purchase alerts and offers. It also understands **bank card
alerts** wherever they arrive (text or email). A Scotiabank alert like *"…authorization… for $144.51 TTD at UBER * EATS
PENDING on your Scotiabank Credit Card ***1234…"* becomes a purchase on that card. That fills the gap from Phase 3,
where store receipts that don't show your last 4 digits couldn't be matched to a card.

Everything here is free: no paid Apple account, and no SMS service.

## What was built

**Bank card alerts** (texts or emails)
- New message kind `card_alert`. The reader pulls out:
  - the shop, cleaned up ("UBER * EATS" → Uber Eats)
  - the amount and currency exactly as charged ("$144.51 TTD" counts as **TT$**)
  - the card's last 4 digits
  - the date (from the message's date when the alert only has a time)
  - whether it's **pending**, approved, declined or reversed
- Declined and reversed charges are ignored. Alerts never create a return window.
- The purchase goes through the Phase 3 matching: protections, deadlines, and automatic credit use.
- **No double counting.** An alert and the store's own receipt for the same purchase are merged into one when all of these match:
  - same amount and currency
  - dates within 2 days
  - the same card, or the receipt doesn't show a card
  - a similar shop name

  The store receipt's details win (proper name, items, order number, return deadline), and the alert adds the card digits. A "pending" alert followed by the settled alert also merge. Two store receipts are never merged, because they're separate orders.
- The card screen marks these as "Bank alert" or "Bank alert · pending".

**Texts from your iPhone** (Shortcuts automation, free)
- New screen: **Settings → Connect texts** (iPhone tab).
  - It creates a separate "iPhone texts" token, shown once with "Bearer " in front, ready to paste. You can revoke it any time.
  - It gives you the URL (`…/functions/v1/ingest/sms`) and step-by-step instructions for a Shortcuts automation.
- Suggested trigger words: `Scotiabank`, `TT$`, `% off`, `promo`, `reward`, `points`. Shortcuts allows one word per automation.
  - I left out **`code`** (it was in the original brief) on purpose: it would also send sign-in codes. PerkScan throws those away, but it's better if they never leave your phone.
- **Send a test text** runs a sample offer text through the reader. The screen also shows **"Last text from your Shortcut: …"**, so you can see that your automation really works.
- If `EXPO_PUBLIC_SHORTCUT_URL` is set to an iCloud Shortcut link, a "Get the ready-made Shortcut" button appears. It's optional, and a placeholder until one is published.

**Android: Share → PerkScan**
- Long-press a text → Share → PerkScan opens it on the "Add a text" screen.
- **No permission to read your texts** is requested. The Android manifest has no `READ_SMS`.
- Built as a tiny local native module (`modules/share-text`) plus a share intent filter. It works in an installed build (`npx expo run:android`), not in Expo Go or the browser.

**Paste a text** (every phone, including Expo Go and web)
- **Settings → Paste a text**: paste a bank alert or an offer, then tap Add.

**Privacy rules for texts**
- **Sign-in and verification codes are thrown away on arrival.** Texts and emails containing one ("Your OTP is 482913", "123456 is your verification code", "G-842917…") are never stored and never sent to the AI.
- Warnings like "we'll never ask for your OTP" are kept, and so are promo codes like SAVE20. Flight confirmation codes are kept too.
- Card numbers are masked, and a text is deleted as soon as it's read (24 hours at most), the same as email.
- Texts have no message id, so a Shortcut that fires twice for the same text is stored once (by a hash of the text and the day).
- They share the 200-per-hour limit and the monthly AI budget with email.

**Gmail: a second account**
- **Connect Gmail → Create another token** makes "Gmail 2". Install the script in the other Gmail account with that token. Both accounts feed the same PerkScan.
- `gmail/README.md` has a new section for this, plus a Gmail filter for Scotiabank alerts.

## Verified here
- **Unit tests (157):**
  - the security-code filter (15 cases, including the wording of your Scotiabank alert)
  - turning alerts into purchases (pending / approved / declined / reversed)
  - shop-name matching and the merge rules
- **Database tests:** 98 across 5 files, 0 failures. The 7 new ones cover:
  - the same text arriving twice is stored once
  - the receipt kind is checked
  - another user can't see your texts or alerts
- **End-to-end test** against a local Supabase:
  - The Scotiabank alert, sent the way the Shortcut sends it, becomes a pending TT$144.51 purchase on the card.
  - Sending it twice stores it once.
  - The Uber email receipt then merges into it: one purchase, with the order number and the card digits.
  - An OTP text is dropped and nothing is stored.
  - Pasting a text works, and a pasted code is refused.
- **Browser walkthrough** of Connect texts, the token, the test text, the paste screen (offer and OTP), the Inbox (texts get a chat icon, alerts are "Card alert") and the card screen (Courts TT$2,899 bank alert → Price protection).
- **Android build setup:** I generated the Android project in a scratch copy:
  - The manifest has the `SEND text/plain` share filter and no SMS permission.
  - Expo picks up the share module automatically.

**Not verified here:** I couldn't compile the Android app, because this machine has no Android SDK. The first real build is yours in Android Studio, below. If it fails, send me the error.

## Your setup steps (Windows, VS Code terminal)
1. `git pull`, then `npm install`.
2. `npx supabase db push`. This adds two receipt columns.
3. Redeploy both functions:
   - `npx supabase functions deploy ingest --no-verify-jwt --use-api`
   - `npx supabase functions deploy process-inbox --use-api`
4. `npx expo start --clear`.

No new required env keys. `EXPO_PUBLIC_SHORTCUT_URL` is optional.

### Bank alerts from your other Gmail
1. In the app: **Settings → Connect Gmail → Create another token**. Copy it.
2. On the computer, sign in to the **other** Gmail account, open script.google.com and add the PerkScan script again (same steps as `gmail/README.md`) with this new token.
3. In that account, add a filter: **From** `scotiabank`, **Has the words** `authorization OR purchase OR transaction` → apply label **PerkScan**. Tick "Also apply to matching conversations" to include recent alerts.

### iPhone texts
1. **Settings → Connect texts → iPhone → Create token**. Copy the token and the URL. Opening this screen in the app on your iPhone makes copying easiest.
2. In **Shortcuts → Automation → + → Message**:
   - Set "Message Contains" to `Scotiabank`, then choose **Run Immediately** → Next → **New Blank Automation**.
   - Add **Get Contents of URL**, then paste the URL.
   - Set Method **POST**.
   - Add a header with key `Authorization` and your token (starting with `Bearer `) as the value.
   - Set Request Body to **JSON**, with a Text field whose key is `text` and whose value is **Shortcut Input → Content**.
3. Repeat step 2 for any other words you want, e.g. `% off`, `promo`.
4. Tap **Send a test text** in the app. Then, to check the automation itself, iMessage yourself something containing "Scotiabank". The screen should show "Last text from your Shortcut: today".

### Android (Android Studio emulator)
1. Start an emulator in Android Studio (Device Manager → ▶).
2. In the project folder: `npx expo run:android`.
   - The first build takes a while.
   - If it says it can't find Java or the SDK, set `JAVA_HOME` to Android Studio's `jbr` folder and `ANDROID_HOME` to `%LOCALAPPDATA%\Android\Sdk`.
3. Send the emulator a text: the emulator's **⋯ → Phone → SMS message**. Paste a sample alert, e.g. your Scotiabank wording with `***0000`.
4. In the emulator's Messages app: long-press the text → **Share → PerkScan** → **Add to PerkScan**.

## What to test
- [ ] Settings shows **Email & texts** with Connect Gmail, Connect texts, Paste a text and Inbox.
- [ ] **Paste a text** with your Scotiabank alert wording (use your real last 4 digits). The toast says "Purchase added to your card", and the card screen lists it as "Bank alert · pending".
- [ ] Paste "123456 is your verification code". The toast says the code wasn't kept, and nothing appears in Inbox.
- [ ] Bank alert emails from your other Gmail arrive (Inbox → "Card alert") and land on your Scotiabank card.
- [ ] iPhone: the Shortcut sends a text and "Last text from your Shortcut" updates.
- [ ] Android emulator: Share → PerkScan opens the text in the app.
- [ ] An Uber Eats order shows **once** on the card even though you got both the bank alert and Uber's email, **when both are in TT$ for the same amount**.

## Known limits
- **Merging needs the same amount and currency.** If Uber's own receipt shows US$ while the bank alert shows TT$, they stay as two purchases on the card. Your totals aren't affected, since purchases aren't counted as money owed.
- **A "pending" purchase stays pending** unless Scotiabank sends a second alert when it settles.
- **iOS needs a separate automation for each trigger word.** Apple doesn't allow sharing a Shortcut link that comes with the token already filled in, which is why setup is manual for now.
- **The Android share module hasn't been compiled here** (see above).

*PerkScan informs and guides. It does not file claims, contact merchants, or give financial or legal advice.*
