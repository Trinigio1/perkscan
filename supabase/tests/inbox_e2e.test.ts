// End-to-end test of the inbox pipeline against a running Supabase (local or staging),
// with a fake model in place of Claude so it costs nothing and is deterministic.
//
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
//     deno test -A --config supabase/functions/deno.json supabase/tests/inbox_e2e.test.ts
//
// It creates two throwaway users and deletes them at the end.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ModelCall } from '../functions/_shared/inbox/parse.ts';
import { ingestHandler } from '../functions/ingest/handler.ts';
import { processHandler } from '../functions/process-inbox/handler.ts';
import { PROMO_HTML, RECEIPT_TEXT, SCOTIA_ALERT_TEXT } from '../functions/_shared/inbox/__fixtures__/emails.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: SupabaseClient = createClient(url, serviceKey, opts);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** Answers like the real model would for our two fixture emails; garbage when told to fail. */
let failNext = 0;
const fakeModel: ModelCall = async (input) => {
  if (failNext > 0) {
    failNext -= 1;
    return { text: '{"oops":', stopReason: 'end_turn', inputTokens: 500, outputTokens: 5 };
  }
  const base = { receipt: null, offers: [] as unknown[] };
  let out: Record<string, unknown>;
  if (input.includes('SPRING20')) {
    out = { ...base, kind: 'promo', merchant: 'Acme Outfitters', summary: '20% off code from Acme', offers: [{ type: 'promo', currency: null, title: '20% off your next order', amount: null, percent_off: 20, code: 'SPRING20', expires_on: '2099-04-30', min_spend: null, points: null, claim_url: null, details: null }] };
  } else if (input.includes('Thanks for your order')) {
    out = { ...base, kind: 'receipt', merchant: 'Acme Outfitters', summary: 'Order from Acme, $101.99', receipt: { total: 101.99, currency: 'USD', purchase_type: 'electronics', travel_date: null, purchase_date: new Date().toISOString().slice(0, 10), card_last_four: '4242', order_number: 'A-1', return_by: null, return_window_days: 30, items: [{ name: 'Trail Runner Shoes', price: 89.99, quantity: 1 }] } };
  } else if (input.includes('authorization made outside')) {
    out = { ...base, kind: 'card_alert', merchant: 'Uber Eats', summary: 'Uber Eats, TT$144.51 (pending)', receipt: { total: 144.51, currency: 'TTD', purchase_type: 'food_delivery', travel_date: null, purchase_date: new Date().toISOString().slice(0, 10), card_last_four: '4242', order_number: null, return_by: null, return_window_days: null, items: [], alert_status: 'pending' } };
  } else if (input.includes('Uber Eats order total')) {
    out = { ...base, kind: 'receipt', merchant: 'Uber Eats', summary: 'Uber Eats order, TT$144.51', receipt: { total: 144.51, currency: 'TTD', purchase_type: 'food_delivery', travel_date: null, purchase_date: new Date().toISOString().slice(0, 10), card_last_four: null, order_number: 'UE-77', return_by: null, return_window_days: null, items: [{ name: 'Burger', price: 144.51, quantity: 1 }], alert_status: null } };
  } else if (input.includes('Uber receipt')) {
    out = { ...base, kind: 'receipt', merchant: 'Uber Eats', summary: 'Uber Eats order, $23.50', receipt: { total: 23.5, currency: 'USD', purchase_type: 'food_delivery', travel_date: null, purchase_date: new Date().toISOString().slice(0, 10), card_last_four: '4242', order_number: null, return_by: null, return_window_days: null, items: [] } };
  } else if (input.includes('THANKS10')) {
    out = { ...base, kind: 'promo', merchant: 'PerkScan Test Shop', summary: '$10 off test code', offers: [{ type: 'promo', currency: null, title: '$10 off $50', amount: 10, percent_off: null, code: 'THANKS10', expires_on: '2099-01-01', min_spend: 50, points: null, claim_url: null, details: null }] };
  } else if (input.includes('TARGET RECEIPT')) {
    out = { ...base, kind: 'receipt', merchant: 'Target', summary: 'Order from Target, $199.99', receipt: { total: 199.99, currency: 'USD', purchase_type: 'electronics', travel_date: null, purchase_date: new Date().toISOString().slice(0, 10), card_last_four: '7777', order_number: 'T-1', return_by: null, return_window_days: null, items: [], warranty_months: 12 } };
  } else if (input.includes('KFC CHARGE')) {
    out = { ...base, kind: 'card_alert', merchant: 'KFC', summary: 'KFC, TT$85', receipt: { total: 85, currency: 'TTD', purchase_type: 'restaurant', travel_date: null, purchase_date: new Date().toISOString().slice(0, 10), card_last_four: '7777', order_number: null, return_by: null, return_window_days: null, items: [], alert_status: 'approved' } };
  } else if (input.includes('FLIGHT CANCELLED')) {
    out = { ...base, kind: 'other', merchant: 'Islandhopper Air', summary: 'Flight cancelled, refund available', offers: [{ type: 'refund', currency: 'USD', title: 'Refund for cancelled flight', amount: 412.8, percent_off: null, code: null, expires_on: '2099-11-20', min_spend: null, points: null, claim_url: 'https://islandhopper.example/refund', details: null }] };
  } else {
    out = { ...base, kind: 'other', merchant: null, summary: 'Newsletter' };
  }
  // Card numbers must never reach the model.
  assert(!/4111 1111 1111 1111/.test(input), 'full card number was sent to the model');
  return { text: JSON.stringify(out), stopReason: 'end_turn', inputTokens: 1200, outputTokens: 150 };
};

const pipeline = { model: 'fake', monthlyBudgetUsd: 100 };
const ingest = ingestHandler({ db: admin, model: fakeModel, pipeline });

async function makeUser(label: string) {
  const email = `inbox-${label}-${Date.now()}@example.com`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, opts);
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, client };
}

const post = (handler: (r: Request) => Promise<Response>, body: unknown, token?: string) =>
  handler(new Request('http://local/ingest', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));

Deno.test('inbox pipeline end to end', async () => {
  const alice = await makeUser('alice');
  const bob = await makeUser('bob');
  // A settlement covering the test store, so a new receipt should match it straight away.
  const settlementId = `e2e_${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  const st = await admin.from('settlements').insert({
    id: settlementId, name: 'E2E Test Settlement', description: 'Test.', eligible_merchants: ['acme outfitters'],
    eligible_products: 'Anything from Acme.', purchase_start: '2020-01-01', purchase_end: '2099-12-31', claim_deadline: '2099-12-31',
    claim_url: 'https://claims.example.com', proof_required: 'A receipt.', eligible_countries: [], status: 'active',
    source_url: 'https://claims.example.com/notice', last_verified: today,
  });
  assert(!st.error, `create test settlement: ${st.error?.message}`);
  try {
    // Alice has a card ending 4242 so the receipt can be matched to it.
    const card = await alice.client.from('user_cards').insert({ card_id: 'amex_gold', last_four: '4242' }).select('id').single();
    assert(!card.error, `add card: ${card.error?.message}`);
    const tok = await alice.client.rpc('create_ingest_token', { p_label: 'Gmail' });
    assert(typeof tok.data === 'string' && tok.data.startsWith('psk_'), 'token created');
    const token = tok.data as string;

    // Auth
    assert((await post(ingest, { messages: [{ text: 'x' }] })).status === 401, 'no token -> 401');
    assert((await post(ingest, { messages: [{ text: 'x' }] }, `psk_${'0'.repeat(64)}`)).status === 401, 'unknown token -> 401');
    assert((await post(ingest, { messages: [] }, token)).status === 400, 'empty batch -> 400');

    // Ingest two emails
    const batch = {
      source: 'email',
      messages: [
        { id: 'g-1', from: 'Acme <deals@acme.com>', subject: 'Spring sale', date: '2026-04-01', html: PROMO_HTML },
        { id: 'g-2', from: 'Acme <orders@acme.com>', subject: 'Your order', date: '2026-04-05', text: RECEIPT_TEXT },
      ],
    };
    const r1 = await (await post(ingest, batch, token)).json();
    assert(r1.accepted === 2 && r1.duplicates === 0, `first ingest: ${JSON.stringify(r1)}`);
    const r2 = await (await post(ingest, batch, token)).json();
    assert(r2.accepted === 0 && r2.duplicates === 2, `re-sent emails are ignored: ${JSON.stringify(r2)}`);

    // What alice now sees through RLS
    const msgs = await alice.client.from('inbound_messages').select('parse_status, kind, summary, raw_body, from_domain, parser_version');
    assert(msgs.data?.length === 2 && msgs.data.every((m) => m.parse_status === 'parsed'), `messages parsed: ${JSON.stringify(msgs.data)}`);
    assert(msgs.data.every((m) => m.raw_body === null), 'raw text deleted after parsing');
    assert(msgs.data.every((m) => /^fake\/\d{4}-\d{2}-\d{2}$/.test(m.parser_version ?? '')), `reader version recorded: ${JSON.stringify(msgs.data)}`);
    assert(msgs.data.some((m) => m.from_domain === 'acme.com'), 'only the sender domain is stored');

    const opps = await alice.client.from('opportunities').select('type, title, code, category, value_estimate').neq('type', 'card_credit');
    const promo = opps.data?.find((o) => o.code === 'SPRING20');
    assert(promo?.category === 'promos', `promo opportunity: ${JSON.stringify(opps.data)}`);
    assert(opps.data?.some((o) => o.type === 'return_window' && o.value_estimate === null), 'return window created with no dollar value');

    const receipts = await alice.client.from('receipts').select('merchant, total, last_four, matched_user_card_id');
    assert(receipts.data?.[0]?.matched_user_card_id === card.data!.id, `receipt matched to the card ending 4242: ${JSON.stringify(receipts.data)}`);

    // Matching: the electronics receipt on the Gold card (purchase protection + extended warranty in the catalog)
    const prots = await alice.client.from('opportunities').select('type, benefit_id, user_card_id, value_estimate, source_receipt_id').eq('type', 'protection');
    assert(prots.data?.some((p) => p.benefit_id === 'amex_gold__purchase_protection' && p.user_card_id === card.data!.id && p.value_estimate === null),
      `purchase protection found for the receipt: ${JSON.stringify(prots.data)}`);
    assert(prots.data?.every((p) => p.source_receipt_id), 'protections link back to their receipt');

    // The receipt falls inside a known settlement: a possible claim appears, worth nothing until paid.
    const claim = await alice.client.from('opportunities').select('type, value_estimate, action_steps').eq('dedupe_key', `settlement:${settlementId}`);
    assert(claim.data?.length === 1 && claim.data[0]!.value_estimate === null, `settlement matched on arrival: ${JSON.stringify(claim.data)}`);

    // An Uber receipt on the same card counts toward the Uber Cash credit, automatically
    await post(ingest, { messages: [{ id: 'g-uber', subject: 'Your Uber receipt', text: 'Uber receipt — thanks for ordering' }] }, token);
    const creditUsage = await alice.client.from('benefit_usage').select('benefit_id, amount_used, marked_by').eq('benefit_id', 'amex_gold__uber_cash');
    assert(creditUsage.data?.[0]?.marked_by === 'auto' && Number(creditUsage.data[0].amount_used) === 23.5, `auto credit use: ${JSON.stringify(creditUsage.data)}`);

    // Re-checking receipts is safe: no duplicate protections, no double-counted credit
    const procR = processHandler({ db: admin, userFromRequest: async () => alice.id, model: fakeModel, pipeline });
    const re = await (await post(procR, { action: 'rematch' })).json();
    assert(re.summary?.receipts >= 2 && re.summary.protections === 0 && re.summary.creditsUsed === 0, `rematch is idempotent: ${JSON.stringify(re)}`);
    const usage2 = await alice.client.from('benefit_usage').select('amount_used').eq('benefit_id', 'amex_gold__uber_cash');
    assert(Number(usage2.data?.[0]?.amount_used) === 23.5, 'credit not counted twice');

    // A bank alert by text (the iPhone Shortcut's shape), then the store's own receipt by email: one purchase
    const smsUrl = 'http://local/ingest/sms';
    const postSms = (body: unknown) =>
      ingest(new Request(smsUrl, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
    const alertText = SCOTIA_ALERT_TEXT.replace('***0000', '***4242');
    const a1 = await (await postSms({ text: alertText })).json();
    assert(a1.accepted === 1, `alert text accepted: ${JSON.stringify(a1)}`);
    const a2 = await (await postSms({ text: alertText })).json();
    assert(a2.accepted === 0 && a2.duplicates === 1, `the same text twice is stored once: ${JSON.stringify(a2)}`);
    const sms = await admin.from('inbound_messages').select('source, parse_status, kind, raw_body').eq('user_id', alice.id).eq('source', 'sms');
    assert(sms.data?.length === 1 && sms.data[0]!.kind === 'card_alert' && sms.data[0]!.raw_body === null, `text parsed and deleted: ${JSON.stringify(sms.data)}`);
    let uber = await alice.client.from('receipts').select('id, kind, pending, last_four, matched_user_card_id, order_number').eq('total', 144.51);
    assert(uber.data?.length === 1 && uber.data[0]!.kind === 'card_alert' && uber.data[0]!.pending && uber.data[0]!.matched_user_card_id === card.data!.id,
      `alert stored as a pending purchase on the card: ${JSON.stringify(uber.data)}`);
    await post(ingest, { messages: [{ id: 'g-uber-tt', subject: 'Your Uber Eats order', date: new Date().toISOString(), text: 'Uber Eats order total TT$144.51. Thanks!' }] }, token);
    uber = await alice.client.from('receipts').select('id, kind, pending, last_four, matched_user_card_id, order_number').eq('total', 144.51);
    assert(uber.data?.length === 1 && uber.data[0]!.kind === 'receipt' && !uber.data[0]!.pending && uber.data[0]!.last_four === '4242' && uber.data[0]!.order_number === 'UE-77',
      `store receipt merged into the alert: ${JSON.stringify(uber.data)}`);

    // Sign-in codes are dropped on arrival: never stored, never sent to the model
    const before = (await admin.from('inbound_messages').select('id', { count: 'exact', head: true }).eq('user_id', alice.id)).count;
    const otp = await (await postSms({ text: 'Your Scotiabank OTP is 482913. Do not share it.' })).json();
    const after = (await admin.from('inbound_messages').select('id', { count: 'exact', head: true }).eq('user_id', alice.id)).count;
    assert(otp.accepted === 0 && otp.skipped_security_codes === 1 && before === after, `security code dropped: ${JSON.stringify(otp)}`);
    assert((await postSms({ nope: true })).status === 400, 'bad text body -> 400');

    // Pasting a text in the app
    const procS = processHandler({ db: admin, userFromRequest: async () => alice.id, model: fakeModel, pipeline });
    const pasted = await (await post(procS, { action: 'submit', text: 'Get 15% off with code SPRING20 at Acme' })).json();
    assert(pasted.result?.status === 'parsed', `pasted text parsed: ${JSON.stringify(pasted)}`);
    const pastedOtp = await (await post(procS, { action: 'submit', text: '123456 is your verification code' })).json();
    assert(pastedOtp.skipped === 'security_code', `pasted code refused: ${JSON.stringify(pastedOtp)}`);

    // Bob sees none of it
    for (const t of ['inbound_messages', 'receipts']) {
      const r = await bob.client.from(t).select('id');
      assert(r.data?.length === 0, `bob cannot see alice's ${t}`);
    }
    assert((await bob.client.from('opportunities').select('id').neq('type', 'card_credit')).data?.length === 0, 'bob cannot see alice offers');

    // Invalid model output twice -> failed; retry later -> parsed
    failNext = 2;
    await post(ingest, { messages: [{ id: 'g-3', subject: 'Newsletter', text: 'Hello from a newsletter' }] }, token);
    const failed = await admin.from('inbound_messages').select('id, parse_status, attempts, raw_body').eq('external_id', 'g-3').single();
    assert(failed.data?.parse_status === 'failed' && failed.data.raw_body !== null, `kept for retry: ${JSON.stringify(failed.data)}`);
    const proc = processHandler({ db: admin, userFromRequest: async () => alice.id, model: fakeModel, pipeline });
    const retried = await (await post(proc, { action: 'retry' })).json();
    assert(retried.results?.[0]?.status === 'parsed', `retry works: ${JSON.stringify(retried)}`);
    const ignored = await admin.from('inbound_messages').select('parse_status').eq('external_id', 'g-3').single();
    assert(ignored.data?.parse_status === 'ignored', 'emails with nothing useful are marked ignored');

    // Test button
    const test = await (await post(proc, { action: 'test' })).json();
    assert(test.result?.status === 'parsed' && test.result.opportunities === 1, `test email: ${JSON.stringify(test)}`);

    // Budget cap
    const broke = ingestHandler({ db: admin, model: fakeModel, pipeline: { model: 'fake', monthlyBudgetUsd: 0 } });
    await post(broke, { messages: [{ id: 'g-4', text: 'Thanks for your order! budget test' }] }, token);
    const capped = await admin.from('inbound_messages').select('parse_status, parse_error').eq('external_id', 'g-4').single();
    assert(capped.data?.parse_status === 'pending' && /budget/i.test(capped.data.parse_error ?? ''), `budget respected: ${JSON.stringify(capped.data)}`);

    const usage = await admin.from('ai_usage').select('cost_usd').eq('user_id', alice.id);
    assert((usage.data?.length ?? 0) >= 4, 'AI usage recorded per parse');

    // Revoked tokens stop working
    const tokenRow = await alice.client.from('ingest_tokens').select('id').single();
    await alice.client.rpc('revoke_ingest_token', { p_id: tokenRow.data!.id });
    assert((await post(ingest, { messages: [{ text: 'x' }] }, token)).status === 401, 'revoked token -> 401');
  } finally {
    await admin.from('settlements').delete().eq('id', settlementId);
    await admin.auth.admin.deleteUser(alice.id);
    await admin.auth.admin.deleteUser(bob.id);
  }
});

Deno.test('hidden money: price adjustments, warranties, double charges, refunds, items added by hand', async () => {
  const cara = await makeUser('cara');
  try {
    await admin.from('profiles').update({ country: 'US', home_currency: 'USD' }).eq('id', cara.id);
    const card = await cara.client.from('user_cards').insert({ card_id: 'scotiabank_tt_visa_classic', last_four: '7777' }).select('id').single();
    assert(!card.error, `add card: ${card.error?.message}`);
    const tok = await cara.client.rpc('create_ingest_token', { p_label: 'Gmail' });
    const token = tok.data as string;

    // A Target receipt with a stated warranty: a 14-day price-adjustment window and a warranty countdown
    await post(ingest, { messages: [{ id: 'h-target', subject: 'Your Target order', text: 'TARGET RECEIPT — thanks for shopping' }] }, token);
    const fromReceipt = await cara.client.from('opportunities').select('type, title, expires_at, value_estimate, source_receipt_id, dedupe_key').like('dedupe_key', '%:%').not('source_receipt_id', 'is', null);
    const adjust = fromReceipt.data?.find((o) => o.type === 'price_drop');
    const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    assert(adjust && adjust.expires_at.startsWith(in14) && adjust.value_estimate === null, `price adjustment window: ${JSON.stringify(fromReceipt.data)}`);
    const warranty = fromReceipt.data?.find((o) => o.dedupe_key.startsWith('warranty:'));
    assert(warranty?.type === 'protection', `warranty from the receipt: ${JSON.stringify(fromReceipt.data)}`);

    // Two identical settled card charges on the same day: "charged twice?" — never claimed as money owed
    await post(ingest, { messages: [{ id: 'h-kfc-1', text: 'KFC CHARGE one' }, { id: 'h-kfc-2', text: 'KFC CHARGE two' }] }, token);
    const twice = await cara.client.from('opportunities').select('type, value_estimate, category').like('dedupe_key', 'double_charge:%');
    assert(twice.data?.length === 1 && twice.data[0]!.type === 'refund' && twice.data[0]!.value_estimate === null && twice.data[0]!.category === 'refunds',
      `double charge flagged once: ${JSON.stringify(twice.data)}`);

    // A refund the email says you're owed
    await post(ingest, { messages: [{ id: 'h-flight', subject: 'Flight update', text: 'FLIGHT CANCELLED — you can request a refund' }] }, token);
    const refund = await cara.client.from('opportunities').select('type, value_estimate, currency, action_steps').eq('title', 'Refund for cancelled flight');
    assert(refund.data?.[0]?.type === 'refund' && Number(refund.data[0]!.value_estimate) === 412.8 && refund.data[0]!.currency === 'USD', `refund owed: ${JSON.stringify(refund.data)}`);

    // Adding your own, then removing it
    const added = await cara.client.rpc('add_my_item', { p_type: 'benefit', p_title: 'FSA balance', p_amount: 250, p_expires_on: '2099-12-31' });
    assert(!added.error && typeof added.data === 'string', `added by hand: ${added.error?.message}`);
    const mine = await cara.client.from('opportunities').select('value_estimate, currency').eq('id', added.data);
    assert(Number(mine.data?.[0]?.value_estimate) === 250 && mine.data?.[0]?.currency === 'USD', `uses the home currency: ${JSON.stringify(mine.data)}`);
    await cara.client.rpc('remove_my_item', { p_id: added.data });
    assert((await cara.client.from('opportunities').select('id').eq('id', added.data)).data?.length === 0, 'removed');
  } finally {
    await admin.auth.admin.deleteUser(cara.id);
  }
});

Deno.test('account deletion removes the user and their data', async () => {
  const { accountHandler } = await import('../functions/account/handler.ts');
  const carol = await makeUser('carol');
  let deleted = false;
  try {
    await carol.client.from('user_cards').insert({ card_id: 'amex_gold', last_four: '7777' });
    await carol.client.from('user_perks').insert({ title: 'Campus perk' });
    const handler = accountHandler({ db: admin, userFromRequest: async () => carol.id });
    const call = (body: unknown) => handler(new Request('http://local/account', { method: 'POST', body: JSON.stringify(body) }));
    assert((await call({ action: 'delete' })).status === 400, 'needs the typed confirmation');
    assert((await accountHandler({ db: admin, userFromRequest: async () => null })(new Request('http://local/account', { method: 'POST', body: '{}' }))).status === 401, 'signed-out requests are refused');
    const res = await (await call({ action: 'delete', confirm: 'DELETE' })).json();
    assert(res.deleted === true, `deleted: ${JSON.stringify(res)}`);
    deleted = true;
    const gone = await admin.auth.admin.getUserById(carol.id);
    assert(!gone.data.user, 'auth user is gone');
    for (const t of ['profiles', 'user_cards', 'user_perks', 'opportunities']) {
      const col = t === 'profiles' ? 'id' : 'user_id';
      const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, carol.id);
      assert(count === 0, `${t} emptied`);
    }
  } finally {
    if (!deleted) await admin.auth.admin.deleteUser(carol.id);
  }
});
