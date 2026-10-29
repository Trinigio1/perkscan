// Perk scout end to end against the local database, with fake store sites and a fake model.
//   deno test -A --config supabase/functions/deno.json supabase/tests/perkscout_e2e.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ModelCall } from '../functions/_shared/inbox/parse.ts';
import { runPerkScout } from '../functions/_shared/perkscout/run.ts';

const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const PAGES: Record<string, string> = {
  'https://www.sweetgreen.com/rewards': '<h1>Sweetgreen Rewards</h1><p>Joining is free: download the app and sign up.</p><p>Members get a free side on their birthday.</p><p>Earn points on every order and redeem them for rewards.</p>',
  'https://www.wingstop.com/rewards': '<h1>Club Wingstop</h1><p>It is free to join Club Wingstop.</p><p>Get $5 off your next order when you sign up as a member.</p><p>Birthday rewards for members.</p>',
};

const fakeFetch = async (url: string) => {
  if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /cart', { status: 200 });
  const body = PAGES[url];
  return Object.defineProperty(new Response(body ?? 'not found', { status: body ? 200 : 404, headers: { 'content-type': 'text/html' } }), 'url', { value: url });
};

const fakeModel: ModelCall = async (input) => {
  const program = input.includes('Sweetgreen Rewards')
    ? { name: 'Sweetgreen Rewards', free_to_join: true, join_evidence: 'Joining is free: download the app and sign up.', how_to_join: 'Download the app and sign up.', perks: [{ title: 'Free birthday side', evidence: 'Members get a free side on their birthday.' }] }
    : input.includes('Club Wingstop')
      ? { name: 'Club Wingstop', free_to_join: true, join_evidence: 'It is free to join Club Wingstop.', how_to_join: 'Sign up on wingstop.com.', perks: [{ title: '$5 off your next order', evidence: 'Get $5 off your next order when you sign up as a member.' }] }
      : null;
  return { text: JSON.stringify({ program }), stopReason: 'end_turn', inputTokens: 1000, outputTokens: 100 };
};

Deno.test('stores people buy from get their free perks found, checked and published', async () => {
  const users: string[] = [];
  const clean = async () => {
    await admin.from('perk_programs').delete().in('id', ['scout_us_sweetgreen', 'scout_us_wingstop']);
    await admin.from('perk_candidates').delete().in('id', ['scout_us_sweetgreen', 'scout_us_wingstop']);
    await admin.from('perk_store_checks').delete().in('store_key', ['sweetgreen', 'wingstop', 'tinyboutiquexyz']);
  };
  await clean();
  try {
    for (let i = 0; i < 2; i++) {
      const { data, error } = await admin.auth.admin.createUser({ email: `ps-${i}-${Date.now()}@example.com`, password: crypto.randomUUID(), email_confirm: true });
      if (error) throw error;
      users.push(data.user.id);
      await admin.from('profiles').update({ country: 'US' }).eq('id', data.user.id);
    }
    const today = new Date().toISOString().slice(0, 10);
    const r = (uid: string, merchant: string) => ({ user_id: uid, merchant, total: 14, currency: 'USD', purchase_date: today, kind: 'receipt' });
    await admin.from('receipts').insert([r(users[0]!, 'Sweetgreen'), r(users[1]!, 'Sweetgreen'), r(users[0]!, 'Wingstop'), r(users[1]!, 'Wingstop'), r(users[0]!, 'Tiny Boutique XYZ')]);

    const report = await runPerkScout(admin, fakeModel, { model: 'fake', monthlyBudgetUsd: 1000, fetch: fakeFetch, today, perRun: 10 });
    const byStore = Object.fromEntries(report.map((x) => [x.store, x.result]));
    assert(byStore.sweetgreen === 'published', `sweetgreen: ${JSON.stringify(report)}`);
    assert(byStore.wingstop === 'held for review', `a dollar amount waits for a person: ${JSON.stringify(report)}`);
    assert(!('tinyboutiquexyz' in byStore), 'a store only one person uses, and no well-known chain, is never looked up');

    const { data: p } = await admin.from('perk_programs').select('kind, status, origin, merchants, countries, summary, evidence, source_url').eq('id', 'scout_us_sweetgreen').single();
    assert(p!.status === 'active' && p!.origin === 'scout' && p!.kind === 'free_perk', `published: ${JSON.stringify(p)}`);
    assert((p!.merchants as string[])[0] === 'sweetgreen' && (p!.countries as string[])[0] === 'US', 'for people who shop there, in their country');
    assert(/free side on their birthday/.test(p!.evidence as string), 'with the page quote it rests on');
    const { data: held } = await admin.from('perk_programs').select('id').eq('id', 'scout_us_wingstop');
    assert(!held?.length, 'held programs are not visible yet');

    // Looked up once: a second run doesn't read them again.
    const again = await runPerkScout(admin, fakeModel, { model: 'fake', monthlyBudgetUsd: 1000, fetch: fakeFetch, today, perRun: 10 });
    assert(!again.some((x) => x.store === 'sweetgreen' || x.store === 'wingstop'), `not re-read: ${JSON.stringify(again)}`);

    // A person approves the held one: it's published.
    const { data: res, error: rErr } = await admin.rpc('review_perk_candidate', { p_id: 'scout_us_wingstop', p_approve: true });
    assert(!rErr && res === 'published', `approved: ${rErr?.message}`);
    const { data: w } = await admin.from('perk_programs').select('status, summary').eq('id', 'scout_us_wingstop').single();
    assert(w!.status === 'active' && /\$5 off/.test(w!.summary as string), `now visible: ${JSON.stringify(w)}`);
  } finally {
    for (const u of users) await admin.auth.admin.deleteUser(u);
    await clean();
  }
});

Deno.test('a scouted program its page no longer backs up is hidden on the monthly re-check', async () => {
  const id = 'scout_us_recheckstore';
  const old = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
  await admin.from('perk_programs').upsert({ id, kind: 'free_perk', name: 'Recheck Rewards', provider: 'Recheck', countries: ['US'], summary: 'Free to join.', how_to: 'Join.', url: 'https://www.recheck.example/rewards', merchants: ['recheckstore'], status: 'active', source_url: 'https://www.recheck.example/rewards', last_verified: old, origin: 'scout' });
  try {
    // The page is gone now.
    const report = await runPerkScout(admin, fakeModel, { model: 'fake', monthlyBudgetUsd: 1000, fetch: fakeFetch, perRun: 0 });
    assert(report.some((x) => x.store === 'recheckstore' && x.result.startsWith('hidden')), `hidden: ${JSON.stringify(report)}`);
    const { data } = await admin.from('perk_programs').select('status').eq('id', id).single();
    assert(data!.status === 'TODO_VERIFY', 'no longer shown');
  } finally {
    await admin.from('perk_programs').delete().eq('id', id);
  }
});
