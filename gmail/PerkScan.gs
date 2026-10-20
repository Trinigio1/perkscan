/**
 * PerkScan for Gmail — sends emails you label "PerkScan" to your PerkScan account.
 *
 * Setup (about 5 minutes, on a computer):
 *   1. Open https://script.google.com, click "New project", delete the sample code, paste this file.
 *   2. Fill in PERKSCAN_URL and PERKSCAN_TOKEN below (both are shown in the app: Settings → Connect Gmail).
 *   3. Choose "testPerkScan" in the function menu and click Run. Approve the permissions
 *      (Google will warn that the app is unverified — it's your own script; click Advanced → Go to project).
 *   4. Choose "installPerkScanTrigger" and click Run once. It now checks every 10 minutes.
 *
 * Only emails with the "PerkScan" label are sent. Nothing else in your inbox is read or shared.
 * Each email is sent once; afterwards the thread gets the "PerkScan-sent" label.
 */

const PERKSCAN_URL = 'https://YOUR-PROJECT.supabase.co/functions/v1/ingest';
const PERKSCAN_TOKEN = 'psk_PASTE_YOUR_TOKEN_HERE';

const LABEL = 'PerkScan';
const SENT_LABEL = 'PerkScan-sent';
const MAX_EMAILS_PER_RUN = 10;
const MAX_TEXT_CHARS = 100000;

/** Runs every 10 minutes once the trigger is installed. */
function syncPerkScan() {
  checkConfig_();
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const sent = GmailApp.getUserLabelByName(SENT_LABEL) || GmailApp.createLabel(SENT_LABEL);
  const threads = GmailApp.search('label:' + LABEL + ' -label:' + SENT_LABEL + ' newer_than:60d', 0, MAX_EMAILS_PER_RUN);
  if (!threads.length) return;

  const messages = [];
  const batchThreads = [];
  for (const thread of threads) {
    const threadMessages = thread.getMessages();
    // Only take whole threads, so a thread is never marked sent with emails left over.
    if (messages.length && messages.length + threadMessages.length > MAX_EMAILS_PER_RUN) break;
    for (const msg of threadMessages.slice(-MAX_EMAILS_PER_RUN)) {
      const text = msg.getPlainBody() || '';
      messages.push({
        id: msg.getId(),
        from: msg.getFrom(),
        subject: msg.getSubject(),
        date: msg.getDate().toISOString(),
        text: text.slice(0, MAX_TEXT_CHARS),
        // Some marketing emails have no real plain-text part; send the HTML only then.
        html: text.trim().length < 200 ? msg.getBody().slice(0, MAX_TEXT_CHARS) : undefined,
      });
    }
    batchThreads.push(thread);
  }

  const res = send_(messages);
  if (res.code === 200) {
    batchThreads.forEach(function (t) { t.addLabel(sent); });
    console.log('PerkScan: sent ' + messages.length + ' email(s). ' + res.body);
  } else if (res.code === 401) {
    throw new Error('PerkScan rejected the token. Create a new one in the app (Settings → Connect Gmail) and paste it here.');
  } else {
    console.warn('PerkScan: will retry next run. HTTP ' + res.code + ': ' + res.body);
  }
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
  if (res.code === 200) console.log('It works! Open PerkScan → Offers in a minute to see the test coupon. ' + res.body);
  else console.error('Something is off. HTTP ' + res.code + ': ' + res.body);
}

/** Run once. Checks for labeled emails every 10 minutes. */
function installPerkScanTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncPerkScan'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncPerkScan').timeBased().everyMinutes(10).create();
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  console.log('Done. Label emails "' + LABEL + '" (or set up a Gmail filter) and they will appear in PerkScan within ~10 minutes.');
}

/** Run to stop syncing. */
function uninstallPerkScanTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncPerkScan'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
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
