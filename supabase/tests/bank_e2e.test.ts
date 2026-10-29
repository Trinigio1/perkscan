// Bank connection end to end against the local database, with a fake Plaid that signs its webhooks
// with a real ES256 key (so verification runs exactly as in production).
//   deno test -A --config supabase/functions/deno.json supabase/tests/bank_e2e.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { bankHandler } from '../functions/bank/handler.ts';
import { bankWebhookHandler } from '../functions/bank-webhook/handler.ts';
import { tokenKey } from '../functions/_shared/bank/crypto.ts';
import { plaidProvider } from '../functions/_shared/bank/plaid.ts';
import type { BankTxn } from '../functions/_shared/bank/transactions.ts';

const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Plaid's signing key (fake) and what the fake Plaid has to say.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
const today = new Date().toISOString().slice(0, 10);
const txn = (t: Partial<BankTxn>): BankTxn => ({
  transaction_id: 'tx-1', account_id: 'acc-cc', amount: 31.2, iso_currency_code: 'USD', date: today, authorized_date: today, name: 'UBER EATS', merchant_name: 'Uber Eats',
  pending: false, pending_transaction_id: null, personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT' }, ...t,
});
const plaid = {
  calls: [] as string[],
  pages: [] as { added: BankTxn[]; modified: BankTxn[]; removed: { transaction_id: string }[] }[],
};
const fakeFetch = async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  plaid.calls.push(path);
  const body = JSON.parse(String(init?.body ?? '{}'));
  assert(body.client_id === 'cid' && body.secret === 'sec', 'keys sent server-side');
  const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
  switch (path) {
    case '/link/token/create':
      return ok({ link_token: `link-sandbox-${crypto.randomUUID()}`, expiration: '2099-01-01T00:00:00Z', hosted_link_url: 'https://secure.plaid.com/hl/abc' });
    case '/item/public_token/exchange':
      return ok({ access_token: 'access-sandbox-secret-token', item_id: 'item-1' });
    case '/accounts/get':
      return ok({ accounts: [{ account_id: 'acc-cc', name: 'Premium Rewards', mask: '6042', type: 'credit', subtype: 'credit card' }, { account_id: 'acc-cc2', name: 'Customized Cash Rewards', mask: '7777', type: 'credit', subtype: 'credit card' }, { account_id: 'acc-chk', name: 'Checking', mask: '1234', type: 'depository', subtype: 'checking' }], item: { institution_id: 'ins_1' } });
    case '/institutions/get_by_id':
      return ok({ institution: { name: 'Bank of America' } });
    case '/transactions/sync': {
      const p = plaid.pages.shift() ?? { added: [], modified: [], removed: [] };
      return ok({ ...p, next_cursor: `cursor-${plaid.calls.length}`, has_more: false });
    }
    case '/webhook_verification_key/get':
      return ok({ key: { ...jwk, kid: body.key_id, alg: 'ES256', use: 'sig', created_at: 1, expired_at: null } });
    case '/item/remove':
      return ok({ removed: true });
  }
  return new Response('{}', { status: 404 });
};

const provider = plaidProvider({ clientId: 'cid', secret: 'sec', env: 'sandbox', fetch: fakeFetch });
const key = await tokenKey(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));

async function signed(body: unknown, opts: { iat?: number; tamper?: boolean; kid?: string } = {}): Promise<Request> {
  const raw = JSON.stringify(body);
  const header = enc({ alg: 'ES256', kid: opts.kid ?? 'kid-1', typ: 'JWT' });
  const payload = enc({ iat: opts.iat ?? Math.floor(Date.now() / 1000), request_body_sha256: hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))) });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
  return new Request('http://x/bank-webhook', { method: 'POST', headers: { 'Plaid-Verification': `${header}.${payload}.${b64url(sig)}` }, body: opts.tamper ? raw.replace('success', 'SUCCESS ') : raw });
}

Deno.test('connect a bank, bring in purchases, merge with emailed receipts, stay in sync', async () => {
  const { data: u, error } = await admin.auth.admin.createUser({ email: `bank-${Date.now()}@example.com`, password: crypto.randomUUID(), email_confirm: true });
  if (error) throw error;
  const uid = u.user.id;
  try {
    await admin.from('user_cards').insert({ user_id: uid, card_id: 'boa_premium_rewards', last_four: '6042' });
    // The store already emailed a receipt for one of the purchases.
    await admin.from('receipts').insert({ user_id: uid, merchant: 'Chipotle', total: 14.2, currency: 'USD', purchase_date: today, kind: 'receipt' });

    const app = bankHandler({ db: admin, provider, key, webhookUrl: 'https://x/bank-webhook', userFromRequest: async () => uid });
    const hook = bankWebhookHandler({ db: admin, provider, key });
    const post = (b: unknown) => app(new Request('http://x/bank', { method: 'POST', body: JSON.stringify(b) }));

    // 1. The app asks for a page to connect.
    const link = await (await post({ action: 'link' })).json();
    assert(link.url === 'https://secure.plaid.com/hl/abc' && link.link_token, `hosted link: ${JSON.stringify(link)}`);

    // 2. Forged, stale or altered webhooks are refused.
    const finished = { webhook_type: 'LINK', webhook_code: 'SESSION_FINISHED', status: 'success', link_token: link.link_token, public_tokens: ['public-sandbox-abcdef123456'] };
    assert((await hook(new Request('http://x', { method: 'POST', body: JSON.stringify(finished) }))).status === 401, 'unsigned refused');
    assert((await hook(await signed(finished, { iat: Math.floor(Date.now() / 1000) - 600 }))).status === 401, 'older than 5 minutes refused');
    assert((await hook(await signed(finished, { tamper: true }))).status === 401, 'altered body refused');

    // 3. The real one: connect and first sync (a purchase on the card, one that matches the emailed receipt, and a transfer).
    plaid.pages.push({
      added: [
        txn({}),
        txn({ transaction_id: 'tx-2', merchant_name: 'Chipotle', name: 'CHIPOTLE 1234', amount: 14.2 }),
        txn({ transaction_id: 'tx-3', amount: 500, merchant_name: null, name: 'TRANSFER TO SAVINGS', personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_SAVINGS' } }),
        txn({ transaction_id: 'tx-4', merchant_name: 'Starbucks', amount: 6.5, pending: true }),
      ],
      modified: [],
      removed: [],
    });
    assert((await hook(await signed(finished))).status === 200, 'signed webhook accepted');
    const status = await (await post({ action: 'status' })).json();
    assert(status.session === 'done', `session done: ${JSON.stringify(status)}`);

    const { data: conn } = await admin.from('bank_connections').select('id, institution_name, status, cursor').eq('user_id', uid).single();
    assert(conn!.institution_name === 'Bank of America' && conn!.status === 'active' && conn!.cursor, `connection: ${JSON.stringify(conn)}`);
    const { data: secret } = await admin.from('bank_secrets').select('access_token').eq('connection_id', conn!.id).single();
    assert((secret!.access_token as string).startsWith('v1:') && !(secret!.access_token as string).includes('access-sandbox'), 'token stored encrypted');
    // A credit card in the bank the user hasn't added is suggested; the one they have and the checking account aren't.
    const { data: spotted } = await admin.from('card_sightings').select('issuer, product, last_four').eq('user_id', uid);
    assert(spotted!.length === 1 && spotted![0]!.last_four === '7777' && spotted![0]!.product === 'Customized Cash Rewards', `card suggested: ${JSON.stringify(spotted)}`);
    const { data: accts } = await admin.from('bank_accounts').select('mask').eq('connection_id', conn!.id);
    assert(accts!.every((a) => /^\d{4}$/.test(a.mask as string)), 'accounts keep only last four');

    const { data: rs } = await admin.from('receipts').select('merchant, total, kind, last_four, bank_txn_id, matched_user_card_id, pending').eq('user_id', uid).order('merchant');
    assert(rs!.length === 3, `uber, chipotle (merged), starbucks; no transfer: ${JSON.stringify(rs)}`);
    const chipotle = rs!.find((r) => r.merchant === 'Chipotle')!;
    assert(chipotle.kind === 'receipt' && chipotle.bank_txn_id === 'tx-2' && chipotle.last_four === '6042', `merged into the emailed receipt: ${JSON.stringify(chipotle)}`);
    const uber = rs!.find((r) => r.merchant === 'Uber Eats')!;
    assert(uber.kind === 'card_alert' && uber.last_four === '6042' && uber.matched_user_card_id, `matched to the card: ${JSON.stringify(uber)}`);

    // 4. New transactions: the pending Starbucks charge settles under a new id.
    plaid.pages.push({ added: [txn({ transaction_id: 'tx-4b', merchant_name: 'Starbucks', amount: 6.5, pending: false, pending_transaction_id: 'tx-4' })], modified: [], removed: [{ transaction_id: 'tx-4' }] });
    assert((await hook(await signed({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'item-1' }))).status === 200, 'sync webhook');
    const { data: sb } = await admin.from('receipts').select('bank_txn_id, pending').eq('user_id', uid).eq('merchant', 'Starbucks');
    assert(sb!.length === 1 && sb![0]!.bank_txn_id === 'tx-4b' && sb![0]!.pending === false, `one settled row: ${JSON.stringify(sb)}`);

    // 5. Syncing the same page again adds nothing.
    plaid.pages.push({ added: [txn({})], modified: [], removed: [] });
    await post({ action: 'sync', connection_id: conn!.id });
    const { count } = await admin.from('receipts').select('id', { count: 'exact', head: true }).eq('user_id', uid);
    assert(count === 3, `no duplicates: ${count}`);

    // 6. Someone else can't sync or disconnect it.
    const other = bankHandler({ db: admin, provider, key, webhookUrl: 'x', userFromRequest: async () => crypto.randomUUID() });
    assert((await other(new Request('http://x', { method: 'POST', body: JSON.stringify({ action: 'disconnect', connection_id: conn!.id }) }))).status === 404, 'not yours');

    // 7. Disconnect: access removed at the bank, connection and token gone, purchases kept.
    const d = await (await post({ action: 'disconnect', connection_id: conn!.id })).json();
    assert(d.disconnected && plaid.calls.includes('/item/remove'), 'removed at Plaid');
    const { data: left } = await admin.from('bank_secrets').select('connection_id').eq('connection_id', conn!.id);
    assert(!left?.length, 'token deleted');
  } finally {
    await admin.auth.admin.deleteUser(uid);
  }
});

Deno.test('access revoked at the bank deletes the token', async () => {
  const { data: u } = await admin.auth.admin.createUser({ email: `bank2-${Date.now()}@example.com`, password: crypto.randomUUID(), email_confirm: true });
  const uid = u!.user!.id;
  try {
    const { data: c } = await admin.from('bank_connections').insert({ user_id: uid, provider: 'plaid', item_id: `item-r-${uid}` }).select('id').single();
    await admin.from('bank_secrets').insert({ connection_id: c!.id, access_token: 'v1:x:y' });
    const hook = bankWebhookHandler({ db: admin, provider, key });
    assert((await hook(await signed({ webhook_type: 'ITEM', webhook_code: 'USER_PERMISSION_REVOKED', item_id: `item-r-${uid}` }))).status === 200, 'accepted');
    const { data: s } = await admin.from('bank_secrets').select('connection_id').eq('connection_id', c!.id);
    const { data: conn } = await admin.from('bank_connections').select('status').eq('id', c!.id).single();
    assert(!s?.length && conn!.status === 'revoked', 'token deleted, marked revoked');
  } finally {
    await admin.auth.admin.deleteUser(uid);
  }
});
