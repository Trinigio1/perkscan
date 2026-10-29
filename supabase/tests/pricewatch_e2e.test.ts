// Price drops end to end against the local database, with a fake store page.
//   deno test -A --config supabase/functions/deno.json supabase/tests/pricewatch_e2e.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runPriceWatch } from '../functions/_shared/pricewatch/run.ts';

const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

Deno.test('a price drop on a recent Target purchase becomes money you can ask for', async () => {
  const { data: u, error } = await admin.auth.admin.createUser({ email: `pw-${Date.now()}@example.com`, password: crypto.randomUUID(), email_confirm: true });
  if (error) throw error;
  const uid = u.user.id;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const bought = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const link = 'https://www.target.com/p/dyson-v8-cordless-vacuum/-/A-12345678';
    const { data: r } = await admin
      .from('receipts')
      .insert({ user_id: uid, merchant: 'Target', total: 399.99, currency: 'USD', purchase_date: bought, kind: 'receipt', purchase_type: 'appliance', items: [{ name: 'Dyson V8 Cordless Vacuum', price: 399.99, quantity: 1 }], product_links: [link] })
      .select('id')
      .single();
    // The reminder the reader adds for a purchase at a price-adjustment store.
    await admin.from('opportunities').insert({ user_id: uid, type: 'price_drop', title: 'Price drop at Target? Get the difference back', merchant: 'Target', currency: 'USD', status: 'open', dedupe_key: `price_adjust:${r!.id}`, source_receipt_id: r!.id });

    let pages = 0;
    const fakeFetch = async (url: string) => {
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /cart', { status: 200 });
      pages += 1;
      const html = `<html><script type="application/ld+json">{"@type":"Product","name":"Dyson V8","offers":{"@type":"Offer","price":"329.99","priceCurrency":"USD"}}</script></html>`;
      return Object.defineProperty(new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }), 'url', { value: url });
    };
    const report = await runPriceWatch(admin, { fetch: fakeFetch, today });
    assert(report.drops >= 1, `found the drop: ${JSON.stringify(report)}`);
    const { data: o } = await admin.from('opportunities').select('title, value_estimate, expires_at, action_steps').eq('user_id', uid).eq('dedupe_key', `price_adjust:${r!.id}`).single();
    assert(Number(o!.value_estimate) === 70, `$70 back: ${JSON.stringify(o)}`);
    assert(/Price dropped: get US\$70 back on Dyson V8 Cordless Vacuum/.test(o!.title as string), `says so: ${o!.title}`);
    const until = new Date(`${bought}T00:00:00Z`);
    until.setUTCDate(until.getUTCDate() + 14);
    assert((o!.expires_at as string).startsWith(until.toISOString().slice(0, 10)), `Target's 14-day window: ${o!.expires_at}`);

    // Checked once a day: a second run the same day doesn't read the page again.
    const before = pages;
    await runPriceWatch(admin, { fetch: fakeFetch, today });
    assert(pages === before, 'not re-read the same day');
  } finally {
    await admin.auth.admin.deleteUser(uid);
  }
});
