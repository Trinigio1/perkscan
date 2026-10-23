// End-to-end test of the scout against a running Supabase, with a fake web page and a fake
// model, so it costs nothing and never touches a real store's site.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     deno test -A --config supabase/functions/deno.json supabase/tests/scout_e2e.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ModelCall } from '../functions/_shared/inbox/parse.ts';
import type { Fetch } from '../functions/_shared/scout/page.ts';
import { discoverStores } from '../functions/_shared/scout/discover.ts';
import { runScout } from '../functions/_shared/scout/run.ts';
import { scoutHandler } from '../functions/scout/handler.ts';

const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const year = new Date().getUTCFullYear() + 1;
let pageBody = '';
const fakeFetch: Fetch = async (url) => {
  if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /', { status: 200 });
  const r = new Response(`<html><body><h1>Promotions</h1>${pageBody}</body></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
  Object.defineProperty(r, 'url', { value: url });
  return r;
};
const item = (o: Record<string, unknown>) => ({
  summary: 'On selected items.', category: 'home', event_kind: null, amount: null, percent_off: null, currency: null, code: null,
  min_spend: null, starts_on: null, ends_on: null, link: null, ...o,
});
// Answers like the real model: the real fridge deal, plus an invented one that isn't on the page.
const fakeModel: ModelCall = async (input) => {
  const found = [];
  if (input.includes('Source: E2E Store') && input.includes('fridges')) {
    found.push(item({ title: 'TT$300 off fridges', amount: 300, code: 'COOL300', ends_on: `${year}-01-15`, evidence: `TT$300 off fridges with code COOL300 until January 15, ${year}.` }));
  }
  if (input.includes('Source: E2E Bank')) {
    found.push(item({ title: '5% Divali cash back', percent_off: 5, category: 'shopping', ends_on: `${year}-01-20`, evidence: `5% Divali cash back on Mastercard until January 20, ${year}.` }));
  }
  found.push(item({ title: 'TT$999 off TVs', amount: 999, evidence: 'TT$999 off every TV in the store.' }));
  return { text: JSON.stringify({ found }), stopReason: 'end_turn', inputTokens: 1000, outputTokens: 200 };
};
const opts = { model: 'fake', monthlyBudgetUsd: 100, fetch: fakeFetch };

Deno.test('scout publishes checked deals, drops invented ones, and takes down ones that disappear', async () => {
  const { error } = await admin.from('deal_sources').upsert([
    { id: 'e2e_store', name: 'E2E Store', kind: 'store', url: 'https://store.example/promos', countries: ['TT'], categories: ['home'], merchants: ['e2estore'], issuers: [], card_keywords: [] },
    { id: 'e2e_bank', name: 'E2E Bank', kind: 'bank', url: 'https://bank.example/promos', countries: ['TT'], categories: [], merchants: [], issuers: ['E2E Bank'], card_keywords: ['mastercard'] },
  ]);
  assert(!error, `sources: ${error?.message}`);
  try {
    pageBody = `<p>TT$300 off fridges with code COOL300 until January 15, ${year}.</p><p>5% Divali cash back on Mastercard until January 20, ${year}.</p>`;
    const reports = await runScout(admin, fakeModel, { ...opts, only: ['e2e_store', 'e2e_bank'] });
    assert(reports.every((r) => r.status === 'ok'), `runs ok: ${JSON.stringify(reports)}`);

    const { data: deals } = await admin.from('deals').select('*').eq('source_id', 'e2e_store');
    assert(deals?.length === 1, `one deal published, got ${deals?.length}`);
    assert(deals[0].code === 'COOL300' && Number(deals[0].amount) === 300 && deals[0].currency === 'TTD' && deals[0].confidence === 'confirmed', 'with checked details');
    assert(reports.find((r) => r.id === 'e2e_store')?.dropped?.['evidence not on page'] === 1, 'the invented TV deal is dropped');

    const { data: events } = await admin.from('local_events').select('*').eq('source_id', 'e2e_bank');
    assert(events?.length === 1 && events[0].category === 'bank_promo' && events[0].issuers[0] === 'E2E Bank', 'bank promotion becomes an event for its cardholders');

    const { data: src } = await admin.from('deal_sources').select('last_status, last_found, failures').eq('id', 'e2e_store').single();
    assert(src?.last_status === 'ok' && src.last_found === 1 && src.failures === 0, 'source bookkeeping');

    // Gone from the page for longer than the grace period: taken down.
    await admin.from('deals').update({ last_seen: new Date(Date.now() - 3 * 86_400_000).toISOString() }).eq('source_id', 'e2e_store');
    pageBody = '<p>No promotions right now. Check back soon for new offers in store, or visit any of our branches to ask about financing.</p>';
    await runScout(admin, fakeModel, { ...opts, only: ['e2e_store'] });
    const { count } = await admin.from('deals').select('id', { count: 'exact', head: true }).eq('source_id', 'e2e_store');
    assert(count === 0, 'deal removed once it disappears');

    // A page that fails counts against the source.
    const broken: Fetch = async () => new Response('nope', { status: 503 });
    await runScout(admin, fakeModel, { ...opts, fetch: broken, only: ['e2e_store'] });
    const { data: after } = await admin.from('deal_sources').select('last_status, failures').eq('id', 'e2e_store').single();
    assert(after?.last_status === 'HTTP 503' && after.failures === 1, 'failure recorded');
  } finally {
    await admin.from('deal_sources').delete().in('id', ['e2e_store', 'e2e_bank']);
    await admin.from('ai_usage').delete().eq('model', 'fake');
  }
});

Deno.test('scout endpoint needs the secret', async () => {
  const handler = scoutHandler({ db: admin, secret: 'x'.repeat(32), model: fakeModel, options: opts });
  const call = (auth?: string) => handler(new Request('http://x/scout', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: '{"only":["none"]}' }));
  assert((await call()).status === 401, 'no secret');
  assert((await call(`Bearer ${'y'.repeat(32)}`)).status === 401, 'wrong secret');
  const ok = await call(`Bearer ${'x'.repeat(32)}`);
  assert(ok.status === 200, `right secret: ${ok.status}`);
  const unset = scoutHandler({ db: admin, secret: null, model: fakeModel, options: opts });
  assert((await unset(new Request('http://x/scout', { method: 'POST' }))).status === 503, 'refuses to run without a secret configured');
});

Deno.test('stores that email several people get their promotions page added to the list', async () => {
  const ids: string[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const { data, error } = await admin.auth.admin.createUser({ email: `disc-${Date.now()}-${i}@example.com`, email_confirm: true });
      assert(!error && data.user, `user: ${error?.message}`);
      ids.push(data.user.id);
    }
    await admin.from('profiles').update({ country: 'TT' }).in('id', ids);
    const { error } = await admin.from('inbound_messages').insert(ids.map((id) => ({ user_id: id, source: 'email', from_domain: 'e2eshop.co.tt', parse_status: 'parsed' })));
    assert(!error, `messages: ${error?.message}`);

    const promo = '<html><body><h1>Specials</h1><p>Save 25% off school bags. Special offer: free delivery on sale items this week only.</p></body></html>';
    const shop: Fetch = async (url) => {
      const pages: Record<string, string> = { 'https://www.e2eshop.co.tt/robots.txt': 'User-agent: *\nAllow: /', 'https://www.e2eshop.co.tt/specials': promo };
      const r = new Response(pages[url] ?? 'nope', { status: pages[url] ? 200 : 404, headers: { 'content-type': url.endsWith('.txt') ? 'text/plain' : 'text/html' } });
      Object.defineProperty(r, 'url', { value: url });
      return r;
    };
    const reports = await discoverStores(admin, { fetch: shop, perRun: 20 });
    assert(reports.some((r) => r.domain === 'e2eshop.co.tt' && r.result === 'added (common path)'), `found: ${JSON.stringify(reports)}`);
    const { data: src } = await admin.from('deal_sources').select('*').eq('id', 'auto_tt_e2eshop_co_tt').single();
    assert(src?.url === 'https://www.e2eshop.co.tt/specials' && src.origin === 'discovered' && src.merchants[0] === 'e2eshop' && src.countries[0] === 'TT', 'added as a discovered store page');

    const again = await discoverStores(admin, { fetch: shop, perRun: 20 });
    assert(!again.some((r) => r.domain === 'e2eshop.co.tt'), 'not looked up twice');
  } finally {
    await admin.from('deal_sources').delete().eq('id', 'auto_tt_e2eshop_co_tt');
    await admin.from('store_domain_checks').delete().eq('domain', 'e2eshop.co.tt');
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
});
