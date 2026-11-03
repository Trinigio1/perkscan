// The monthly card check end to end against the local database, with a fake bank page, a fake price
// page and a fake model.
//   deno test -A --config supabase/functions/deno.json supabase/tests/cardcheck_e2e.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runCardCheck } from '../functions/_shared/cardcheck/run.ts';
import type { ModelCall } from '../functions/_shared/inbox/parse.ts';

const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const CARD_URL = 'https://bank.example.com/cards/e2e-rewards';
const PRICE_URL = 'https://lounges.example.com/membership';
const PAGES: Record<string, string> = {
  [CARD_URL]: `<h1>E2E Rewards Card</h1><p>Annual fee: $95.</p>
    <p>Get up to $150 in airline incidental statement credits each year for qualifying purchases.</p>
    <p>Enjoy complimentary Priority Pass Select membership with access to 1,300+ airport lounges.</p>
    <p>Cell phone protection when you pay your monthly phone bill with your card.</p>`,
  [PRICE_URL]: '<h1>Membership</h1><p>Standard: $99 a year.</p><p>Lounge visits are US$38 per person per visit for members and guests.</p>',
};
const fakeFetch = async (url: string) => {
  if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /', { status: 200 });
  const body = PAGES[url];
  return Object.defineProperty(new Response(body ?? 'not found', { status: body ? 200 : 404, headers: { 'content-type': 'text/html' } }), 'url', { value: url });
};
const reply = (o: unknown) => ({ text: JSON.stringify(o), stopReason: 'end_turn', inputTokens: 2000, outputTokens: 200 });
// Answers for every perk it's given, like the real model: the one added on the first run is on the page too.
const cardModel: ModelCall = async (input) =>
  reply({
    annual_fee: { amount: 95, evidence: 'Annual fee: $95.' },
    known: [
      { id: 'e2e_card__airline', on_page: true, amount: 150, evidence: 'Get up to $150 in airline incidental statement credits each year for qualifying purchases.' },
      { id: 'e2e_card__lounges', on_page: true, amount: null, evidence: 'Enjoy complimentary Priority Pass Select membership with access to 1,300+ airport lounges.' },
      { id: 'e2e_card__concierge', on_page: false, amount: null, evidence: '' },
      ...(input.includes('e2e_card__scout_cell_phone_protection')
        ? [{ id: 'e2e_card__scout_cell_phone_protection', on_page: true, amount: null, evidence: 'Cell phone protection when you pay your monthly phone bill with your card.' }]
        : []),
    ],
    new_benefits: [{ name: 'Cell phone protection', type: 'protection', amount: null, period: null, evidence: 'Cell phone protection when you pay your monthly phone bill with your card.' }],
  });
const priceModel: ModelCall = async () => reply({ amount: 38, currency: 'USD', evidence: 'Lounge visits are US$38 per person per visit for members and guests.' });

Deno.test('the monthly card check confirms, flags, adds and re-prices from the official pages', async () => {
  const clean = async () => {
    await admin.from('cards').delete().eq('id', 'e2e_card');
    await admin.from('perk_prices').delete().eq('id', 'e2e_visit');
    await admin.from('ai_usage').delete().eq('model', 'e2e-card-check');
  };
  await clean();
  try {
    const today = new Date().toISOString().slice(0, 10);
    let r = await admin.from('perk_prices').insert({ id: 'e2e_visit', label: 'lounge visit', label_plural: 'lounge visits', amount: 35, currency: 'USD', per: 'use', basis: 'What a lounge network charges per visit.', source_url: PRICE_URL, last_verified: '2026-10-01' });
    assert(!r.error, `price: ${r.error?.message}`);
    r = await admin.from('cards').insert({ id: 'e2e_card', issuer: 'E2E Bank', product_name: 'E2E Rewards Card', currency: 'USD', annual_fee: 95, status: 'active', source_url: CARD_URL, last_verified: '2026-10-01' });
    assert(!r.error, `card: ${r.error?.message}`);
    const base = { card_id: 'e2e_card', period_anchor: 'calendar', status: 'active', source_url: CARD_URL, last_verified: '2026-10-01' };
    r = await admin.from('card_benefits').insert([
      { ...base, id: 'e2e_card__airline', type: 'credit', name: 'Airline incidental credit', amount: 100, period: 'annual' },
      { ...base, id: 'e2e_card__lounges', type: 'perk', name: 'Airport lounge access', period: 'per_claim', worth_price_id: 'e2e_visit' },
      { ...base, id: 'e2e_card__concierge', type: 'perk', name: 'Concierge service', period: 'per_claim' },
    ]);
    assert(!r.error, `benefits: ${r.error?.message}`);

    const report = await runCardCheck(admin, { card: cardModel, price: priceModel }, { model: 'e2e-card-check', monthlyBudgetUsd: 100, fetch: fakeFetch, cardIds: ['e2e_card'] });
    assert(JSON.stringify(report) === JSON.stringify([{ kind: 'card', id: 'e2e_card', result: 'changed' }]), `card report: ${JSON.stringify(report)}`);

    const { data: b } = await admin.from('card_benefits').select('id, amount, last_verified, check_result, origin, worth').eq('card_id', 'e2e_card').order('id');
    const by = Object.fromEntries((b ?? []).map((x) => [x.id, x]));
    assert(by['e2e_card__lounges']?.check_result === 'confirmed' && by['e2e_card__lounges']?.last_verified === today, 'lounges confirmed and dated today');
    assert(Number(by['e2e_card__airline']?.amount) === 100 && by['e2e_card__airline']?.last_verified === today, 'the credit keeps its amount (a change waits for review) and is dated today');
    assert(by['e2e_card__concierge']?.check_result === 'not_on_page' && by['e2e_card__concierge']?.last_verified === '2026-10-01', 'concierge flagged, not re-dated');
    assert(by['e2e_card__scout_cell_phone_protection']?.origin === 'scout', 'the new perk without an amount is added from the page');

    const { data: ch } = await admin.from('catalog_changes').select('kind, status, summary').eq('card_id', 'e2e_card').order('kind');
    const kinds = (ch ?? []).map((x) => `${x.kind}:${x.status}`).sort();
    assert(JSON.stringify(kinds) === JSON.stringify(['amount_changed:review', 'new_perk:applied', 'not_on_page:review']), `changes: ${JSON.stringify(kinds)}`);
    const { data: card } = await admin.from('cards').select('check_result, checked_at').eq('id', 'e2e_card').single();
    assert(card?.check_result === 'changed' && card.checked_at, 'card marked checked');

    // A second run the same month adds no duplicates.
    await runCardCheck(admin, { card: cardModel, price: priceModel }, { model: 'e2e-card-check', monthlyBudgetUsd: 100, fetch: fakeFetch, cardIds: ['e2e_card'] });
    const { count } = await admin.from('catalog_changes').select('id', { count: 'exact', head: true }).eq('card_id', 'e2e_card');
    assert(count === 3, `no duplicate changes (${count})`);

    // The price: $35 -> $38 is applied on its own and re-values the lounge perk.
    const pr = await runCardCheck(admin, { card: cardModel, price: priceModel }, { model: 'e2e-card-check', monthlyBudgetUsd: 100, fetch: fakeFetch, priceIds: ['e2e_visit'] });
    assert(JSON.stringify(pr) === JSON.stringify([{ kind: 'price', id: 'e2e_visit', result: 'updated' }]), `price report: ${JSON.stringify(pr)}`);
    const { data: price } = await admin.from('perk_prices').select('amount, last_verified, check_result').eq('id', 'e2e_visit').single();
    assert(Number(price?.amount) === 38 && price?.last_verified === today && price?.check_result === 'updated', 'price updated');
    const { data: lounge } = await admin.from('card_benefits').select('worth, worth_basis').eq('id', 'e2e_card__lounges').single();
    assert(Number(lounge?.worth) === 38 && lounge?.worth_basis?.startsWith('$38 each time.'), `lounge re-valued: ${JSON.stringify(lounge)}`);
    const { data: pc } = await admin.from('catalog_changes').select('kind, status').eq('price_id', 'e2e_visit');
    assert(pc?.length === 1 && pc[0]!.kind === 'price_changed' && pc[0]!.status === 'applied', 'price change logged as applied');
  } finally {
    await clean();
  }
});
