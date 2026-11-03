// Daily recall fetch end to end against the local database, with a fake CPSC response.
//   deno test -A --config supabase/functions/deno.json supabase/tests/recalls_e2e.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runRecallFetch } from '../functions/_shared/recalls/cpsc.ts';

const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

Deno.test('recalls are fetched once a day, stored, and fetched again from the newest one', async () => {
  const asked: string[] = [];
  const fake = async (url: string) => {
    asked.push(url);
    return new Response(JSON.stringify([{ RecallID: 990001, RecallDate: '2026-10-20T00:00:00', Title: 'E2E Recalls Heaters', URL: 'https://www.cpsc.gov/Recalls/e2e', Products: [{ Name: 'E2E Heater', Model: 'EH-1000' }], Manufacturers: [{ Name: 'E2E Co' }], RemedyOptions: [{ Option: 'Refund' }] }]), { status: 200 });
  };
  await admin.from('product_recalls').delete().neq('id', '');
  try {
    const first = await runRecallFetch(admin, { fetch: fake, now: new Date('2026-11-03T10:00:00Z') });
    assert(JSON.stringify(first) === '{"fetched":1}', `first: ${JSON.stringify(first)}`);
    assert(asked[0]!.includes('RecallDateStart=2025-05-'), `first run looks back 18 months: ${asked[0]}`);
    const again = await runRecallFetch(admin, { fetch: fake, now: new Date('2026-11-03T15:00:00Z') });
    assert(JSON.stringify(again) === '{"skipped":"fetched today"}', `same day: ${JSON.stringify(again)}`);
    await runRecallFetch(admin, { fetch: fake, now: new Date('2026-11-04T12:00:00Z') });
    assert(asked[1]!.includes('RecallDateStart=2026-10-13'), `next day starts a week before the newest recall: ${asked[1]}`);
    const { data } = await admin.from('product_recalls').select('id, remedies, products').eq('id', '990001').single();
    assert(data?.remedies?.[0] === 'Refund' && data.products[0].model === 'EH-1000', `stored: ${JSON.stringify(data)}`);
  } finally {
    await admin.from('product_recalls').delete().eq('id', '990001');
  }
});
