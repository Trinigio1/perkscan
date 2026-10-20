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
import { PROMO_HTML, RECEIPT_TEXT } from '../functions/_shared/inbox/__fixtures__/emails.ts';

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
    out = { ...base, kind: 'promo', merchant: 'Acme Outfitters', summary: '20% off code from Acme', offers: [{ type: 'promo', title: '20% off your next order', amount: null, percent_off: 20, code: 'SPRING20', expires_on: '2099-04-30', min_spend: null, points: null, claim_url: null, details: null }] };
  } else if (input.includes('Thanks for your order')) {
    out = { ...base, kind: 'receipt', merchant: 'Acme Outfitters', summary: 'Order from Acme, $101.99', receipt: { total: 101.99, currency: 'USD', purchase_date: new Date().toISOString().slice(0, 10), card_last_four: '4242', order_number: 'A-1', return_by: null, return_window_days: 30, items: [{ name: 'Trail Runner Shoes', price: 89.99, quantity: 1 }] } };
  } else if (input.includes('THANKS10')) {
    out = { ...base, kind: 'promo', merchant: 'PerkScan Test Shop', summary: '$10 off test code', offers: [{ type: 'promo', title: '$10 off $50', amount: 10, percent_off: null, code: 'THANKS10', expires_on: '2099-01-01', min_spend: 50, points: null, claim_url: null, details: null }] };
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
    const msgs = await alice.client.from('inbound_messages').select('parse_status, kind, summary, raw_body, from_domain');
    assert(msgs.data?.length === 2 && msgs.data.every((m) => m.parse_status === 'parsed'), `messages parsed: ${JSON.stringify(msgs.data)}`);
    assert(msgs.data.every((m) => m.raw_body === null), 'raw text deleted after parsing');
    assert(msgs.data.some((m) => m.from_domain === 'acme.com'), 'only the sender domain is stored');

    const opps = await alice.client.from('opportunities').select('type, title, code, category, value_estimate').neq('type', 'card_credit');
    const promo = opps.data?.find((o) => o.code === 'SPRING20');
    assert(promo?.category === 'promos', `promo opportunity: ${JSON.stringify(opps.data)}`);
    assert(opps.data?.some((o) => o.type === 'return_window' && o.value_estimate === null), 'return window created with no dollar value');

    const receipts = await alice.client.from('receipts').select('merchant, total, last_four, matched_user_card_id');
    assert(receipts.data?.[0]?.matched_user_card_id === card.data!.id, `receipt matched to the card ending 4242: ${JSON.stringify(receipts.data)}`);

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
    await admin.auth.admin.deleteUser(alice.id);
    await admin.auth.admin.deleteUser(bob.id);
  }
});
