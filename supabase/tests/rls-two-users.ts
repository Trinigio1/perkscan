// End-to-end RLS check through the real API with two signed-in users.
// Creates two throwaway users, runs the checks, then deletes them.
//
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm run test:rls
//
// Use a local or staging project. The service role key is only used to create
// and delete the test users.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publishable || !service) {
  console.error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, service, opts);
let failures = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'ok    ' : 'FAIL  '} ${name}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
}

async function makeUser(label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `rls-${label}-${Date.now()}@example.com`;
  const password = `pw-${crypto.randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const client = createClient(url!, publishable!, opts);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: created.data.user.id, client };
}

async function main() {
  const anon = createClient(url!, publishable!, opts);
  const alice = await makeUser('alice');
  const bob = await makeUser('bob');

  try {
    const { data: cards } = await alice.client.from('cards').select('id').limit(1);
    check('signed-in users can read the card catalog', (cards?.length ?? 0) === 1);
    const cardId = cards![0]!.id as string;

    const added = await alice.client.from('user_cards').insert({ card_id: cardId, last_four: '4242' }).select().single();
    check('alice can add her own card', !added.error, added.error);

    const fullNumber = await alice.client.from('user_cards').insert({ card_id: cardId, last_four: '4242424242424242' });
    check('full card numbers are rejected', !!fullNumber.error);

    const sync = await alice.client.rpc('sync_my_card_credits');
    check('alice can sync her credits', !sync.error, sync.error);

    const aliceOpps = await alice.client.from('opportunities').select('id, user_id');
    check('alice sees her credit opportunities', (aliceOpps.data?.length ?? 0) > 0, aliceOpps.error);
    const target = aliceOpps.data?.[0]?.id as string | undefined;

    if (target) {
      const marked = await alice.client.rpc('mark_credit_used', { p_opportunity_id: target, p_is_used: true });
      check('alice can mark her credit used', !marked.error, marked.error);
    }

    // Bob sees none of it and can't touch it.
    for (const table of ['user_cards', 'opportunities', 'recovered', 'benefit_usage', 'receipts', 'inbound_messages']) {
      const r = await bob.client.from(table).select('*');
      check(`bob sees no rows in ${table}`, !r.error && r.data?.length === 0, r.error ?? r.data?.length);
    }
    const profiles = await bob.client.from('profiles').select('id');
    check('bob sees only his own profile', profiles.data?.length === 1 && profiles.data[0]!.id === bob.id);

    if (target) {
      const upd = await bob.client.from('opportunities').update({ status: 'dismissed' }).eq('id', target).select();
      check('bob cannot change alice’s opportunity', (upd.data?.length ?? 0) === 0);
      const rpc = await bob.client.rpc('mark_credit_used', { p_opportunity_id: target, p_is_used: true });
      check('bob cannot mark alice’s credit', !!rpc.error);
    }

    const steal = await bob.client.from('user_cards').insert({ user_id: alice.id, card_id: cardId, last_four: '1111' });
    check('bob cannot add a card to alice’s account', !!steal.error);

    const forge = await bob.client.from('recovered').insert({ user_id: bob.id, amount: 1000 });
    check('users cannot write recovered money directly', !!forge.error);

    const fwd = await bob.client.from('profiles').update({ forwarding_address: 'x@y.z' }).eq('id', bob.id);
    check('forwarding address is not user-editable', !!fwd.error);

    const anonCards = await anon.from('cards').select('id');
    check('signed-out requests see nothing', !!anonCards.error || anonCards.data?.length === 0);

    const del = await alice.client.from('user_cards').delete().eq('id', added.data?.id);
    check('alice can delete her card', !del.error, del.error);
  } finally {
    await admin.auth.admin.deleteUser(alice.id);
    await admin.auth.admin.deleteUser(bob.id);
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll RLS checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
