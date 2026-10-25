/**
 * PerkScan for Gmail — finds receipts, bank alerts, codes, gift cards, travel credits, expiring points,
 * free-night certificates, refunds, trials and card statements in your Gmail and sends them to your PerkScan account.
 *
 * Setup (about 5 minutes, on a computer):
 *   1. Open https://script.google.com, click "New project", delete the sample code, paste this file.
 *   2. Fill in PERKSCAN_URL and PERKSCAN_TOKEN below (both are shown in the app: Settings → Gmail).
 *   3. Choose "testPerkScan" in the function menu and click Run. Approve the permissions
 *      (Google will warn that the app is unverified — it's your own script; click Advanced → Go to project).
 *   4. Choose "installPerkScanTrigger" and click Run once. It now checks every 10 minutes.
 *   5. Optional: choose "scanPastYear" and click Run once to also look through the last 12 months.
 *
 * The script runs inside your own Google account. It searches for the kinds of email PerkScan can use
 * (AUTO_SCAN), plus anything you label "PerkScan" yourself. Sign-in and verification-code emails are skipped.
 * Set AUTO_SCAN = false to send only emails you label "PerkScan".
 * Each email is sent once; afterwards the thread gets the "PerkScan-sent" label.
 */

const PERKSCAN_URL = 'https://YOUR-PROJECT.supabase.co/functions/v1/ingest';
const PERKSCAN_TOKEN = 'psk_PASTE_YOUR_TOKEN_HERE';

/** true: search Gmail for useful emails automatically. false: only emails you label "PerkScan". */
const AUTO_SCAN = true;

const LABEL = 'PerkScan';
const SENT_LABEL = 'PerkScan-sent';
/** PerkScan accepts up to 20 emails per request, and up to 200 an hour per account. */
const BATCH = 20;
/** Stop well before Apps Script's 6-minute limit; the next run picks up where this one stopped. */
const MAX_RUN_MS = 4 * 60 * 1000;
const MAX_TEXT_CHARS = 100000;

// What PerkScan can use. Gmail's own "Purchases" category catches most receipts.
const WANTED = [
  'category:purchases',
  'subject:(receipt OR "order confirmation" OR "your order" OR invoice OR "has shipped" OR "booking confirmation" OR itinerary)',
  'subject:("gift card" OR "e-gift" OR "store credit" OR voucher OR refund OR "price adjustment" OR warranty)',
  '("promo code" OR "coupon code" OR "use code" OR "discount code" OR "add this offer")',
  '((points OR miles OR stars OR rewards) (expire OR expiring OR expiration))',
  '("free trial" OR "trial ends" OR "will renew" OR "renews on")',
  '((authorization OR "card ending" OR transaction OR purchase) (alert OR notification OR approved OR pending))',
  '((settlement OR "class action") claim)',
  '(cancelled OR canceled OR delayed) (flight OR order) refund',
  // Credits and certificates people forget: airline eCredits, travel vouchers, free nights, companion fares.
  '("travel credit" OR "flight credit" OR ecredit OR "e-credit" OR "trip credit" OR "travel voucher" OR "travel bank" OR "travel funds")',
  '("free night" OR "companion certificate" OR "companion fare" OR "upgrade certificate") (expire OR expires OR expiring OR "use by" OR "valid until" OR available)',
  // Which cards you carry (for cards you haven't added yet): statements and payment notices from card issuers.
  // Only the issuer, the card's name and its last 4 digits are kept.
  '(from:(chase.com OR americanexpress.com OR aexp.com OR capitalone.com OR citi.com OR citibank.com OR discover.com OR wellsfargo.com OR bankofamerica.com OR usbank.com OR barclaycardus.com OR synchronybank.com) subject:(statement OR "payment due" OR "payment is due" OR "payment received" OR "payment scheduled" OR autopay OR "card benefits" OR "your card"))',
];
// Never send: account security emails, social and forum notifications, spam, bin.
const SKIP = '-in:spam -in:trash -category:social -category:forums ' +
  '-subject:("verification code" OR "security code" OR "sign in" OR "sign-in" OR "log in" OR password OR OTP OR "one-time")';

function query_(newer) {
  const wanted = AUTO_SCAN ? '(label:' + LABEL + ' OR ' + WANTED.join(' OR ') + ')' : 'label:' + LABEL;
  return wanted + ' -label:' + SENT_LABEL + ' newer_than:' + newer + ' ' + SKIP;
}

/** Runs every 10 minutes once the trigger is installed. While a past-year scan is pending, it continues that too. */
function syncPerkScan() {
  checkConfig_();
  const props = PropertiesService.getUserProperties();
  // New mail first; then, if scanPastYear was started, older mail until it's done.
  const recentDone = sendMatching_(query_('14d'));
  if (recentDone && props.getProperty('PERKSCAN_BACKFILL') === 'on') {
    if (sendMatching_(query_('365d'))) {
      props.deleteProperty('PERKSCAN_BACKFILL');
      console.log('PerkScan: finished looking through the last 12 months.');
    }
  }
}

/** Run once to also look through the last 12 months. It continues over the next runs until done. */
function scanPastYear() {
  checkConfig_();
  PropertiesService.getUserProperties().setProperty('PERKSCAN_BACKFILL', 'on');
  syncPerkScan();
  console.log('PerkScan: scanning the last 12 months. Large mailboxes take a few hours — it continues by itself every 10 minutes.');
}

/** Sends matching emails in batches. Returns true when nothing is left, false when it had to stop early. */
function sendMatching_(q) {
  const started = Date.now();
  const sent = GmailApp.getUserLabelByName(SENT_LABEL) || GmailApp.createLabel(SENT_LABEL);
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  while (Date.now() - started < MAX_RUN_MS) {
    const threads = GmailApp.search(q, 0, BATCH);
    if (!threads.length) return true;

    const messages = [];
    const batchThreads = [];
    for (const thread of threads) {
      const threadMessages = thread.getMessages();
      // Only take whole threads, so a thread is never marked sent with emails left over.
      if (messages.length && messages.length + threadMessages.length > BATCH) break;
      for (const msg of threadMessages.slice(-BATCH)) messages.push(toPayload_(msg));
      batchThreads.push(thread);
    }

    const res = send_(messages);
    if (res.code === 200) {
      batchThreads.forEach(function (t) { t.addLabel(sent); });
      console.log('PerkScan: sent ' + messages.length + ' email(s). ' + res.body);
    } else if (res.code === 401) {
      throw new Error('PerkScan rejected the token. Create a new one in the app (Settings → Gmail) and paste it here.');
    } else if (res.code === 429) {
      console.log('PerkScan: hourly limit reached; continuing next run.');
      return false;
    } else {
      console.warn('PerkScan: will retry next run. HTTP ' + res.code + ': ' + res.body);
      return false;
    }
  }
  return false;
}

function toPayload_(msg) {
  const text = msg.getPlainBody() || '';
  return {
    id: msg.getId(),
    from: msg.getFrom(),
    subject: msg.getSubject(),
    date: msg.getDate().toISOString(),
    text: text.slice(0, MAX_TEXT_CHARS),
    // Some marketing emails have no real plain-text part; send the HTML only then.
    html: text.trim().length < 200 ? msg.getBody().slice(0, MAX_TEXT_CHARS) : undefined,
  };
}

/** Sends one fictional sample email so you can check the connection end to end. */
function testPerkScan() {
  checkConfig_();
  const expires = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const res = send_([{
    id: 'gmail-test-' + Date.now(),
    from: 'PerkScan Test Shop <hello@test-shop.example>',
    subject: 'Your test coupon',
    date: new Date().toISOString(),
    text: 'This is a PerkScan connection test. Here is $10 off your next order of $50+ with code GMAILTEST10. Expires ' + expires + '.',
  }]);
  if (res.code === 200) console.log('It works! Open PerkScan → Money in a minute to see the test coupon. ' + res.body);
  else console.error('Something is off. HTTP ' + res.code + ': ' + res.body);
}

/** Shows how many emails would be sent, without sending anything. */
function previewPerkScan() {
  const recent = GmailApp.search(query_('14d'), 0, 100).length;
  const year = GmailApp.search(query_('365d'), 0, 500).length;
  console.log('Would send ' + recent + ' thread(s) from the last 2 weeks' + (AUTO_SCAN ? ', and up to ' + year + ' from the last 12 months with scanPastYear.' : '.'));
}

/** Run once. Checks for new emails every 10 minutes. */
function installPerkScanTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncPerkScan'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncPerkScan').timeBased().everyMinutes(10).create();
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  console.log(AUTO_SCAN
    ? 'Done. PerkScan now finds useful emails by itself every 10 minutes. Run scanPastYear to include the last 12 months.'
    : 'Done. Label emails "' + LABEL + '" and they will appear in PerkScan within ~10 minutes.');
}

/** Run to stop syncing. */
function uninstallPerkScanTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncPerkScan'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  PropertiesService.getUserProperties().deleteProperty('PERKSCAN_BACKFILL');
  console.log('PerkScan sync stopped.');
}

function send_(messages) {
  const response = UrlFetchApp.fetch(PERKSCAN_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + PERKSCAN_TOKEN },
    payload: JSON.stringify({ source: 'email', messages: messages }),
    muteHttpExceptions: true,
  });
  return { code: response.getResponseCode(), body: response.getContentText().slice(0, 300) };
}

function checkConfig_() {
  if (PERKSCAN_URL.indexOf('YOUR-PROJECT') !== -1 || PERKSCAN_TOKEN.indexOf('PASTE') !== -1) {
    throw new Error('Fill in PERKSCAN_URL and PERKSCAN_TOKEN at the top of the script first.');
  }
}
