import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtMoney } from '../inbox/opportunities.ts';
import { readHtml, type Fetch } from '../scout/page.ts';
import { claimUntil, itemForLink, priceDrop, priceFromHtml, type WatchProgram } from './watch.ts';

// Once a day: for purchases still inside their store's price-adjustment window, read each product page the
// receipt linked to, and when the price has dropped, turn the purchase's "Price drop?" reminder into the
// real amount you can ask for. Pages are read politely (robots.txt, https, same site), a capped number per run.

export interface PriceWatchReport {
  checked: number;
  drops: number;
  errors: string[];
}

const endOfDay = (d: string) => `${d}T23:59:59Z`;

export async function runPriceWatch(db: SupabaseClient, opts: { fetch?: Fetch; today?: string; maxPages?: number } = {}): Promise<PriceWatchReport> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const maxPages = opts.maxPages ?? 40;
  const report: PriceWatchReport = { checked: 0, drops: 0, errors: [] };

  const { data: progs, error: pErr } = await db.from('perk_programs').select('id, merchants, window_days, how_to, url').eq('kind', 'price_adjust').eq('status', 'active');
  if (pErr) throw new Error(`perk_programs: ${pErr.message}`);
  const programs = (progs ?? []) as WatchProgram[];
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 45);
  const { data: receipts, error } = await db
    .from('receipts')
    .select('id, user_id, merchant, currency, purchase_date, return_by, items, product_links, price_checked_at')
    .eq('kind', 'receipt')
    // Each purchase at most once a day (the scout runs hourly).
    .or(`price_checked_at.is.null,price_checked_at.lt.${new Date(Date.parse(`${today}T00:00:00Z`) - 20 * 3_600_000).toISOString()}`)
    .gte('purchase_date', since.toISOString().slice(0, 10))
    .neq('product_links', '{}')
    .order('purchase_date', { ascending: false })
    .limit(200);
  if (error) throw new Error(`receipts: ${error.message}`);

  for (const r of receipts ?? []) {
    if (report.checked >= maxPages) break;
    const window = r.purchase_date ? claimUntil(r.merchant as string, r.purchase_date as string, (r.return_by as string | null) ?? null, programs) : null;
    if (!window || window.until < today) continue;
    const items = ((r.items ?? []) as { name: string; price: number | null; quantity: number | null }[]).filter((i) => i.price !== null && (i.quantity ?? 1) === 1);
    const found: { name: string; paid: number; now: number; diff: number; url: string }[] = [];
    await db.from('receipts').update({ price_checked_at: new Date().toISOString() }).eq('id', r.id);
    for (const url of ((r.product_links ?? []) as string[]).slice(0, 3)) {
      if (report.checked >= maxPages) break;
      report.checked += 1;
      const page = await readHtml(url, opts.fetch);
      if (!page.ok) {
        report.errors.push(`${new URL(url).hostname}: ${page.error}`);
        continue;
      }
      const price = priceFromHtml(page.html);
      const item = itemForLink(items, url);
      if (!price || !item || (price.currency && price.currency !== r.currency)) continue;
      const diff = priceDrop(Number(item.price), price.price);
      if (diff) found.push({ name: item.name, paid: Number(item.price), now: price.price, diff, url });
    }
    if (!found.length) continue;

    const total = Math.round(found.reduce((n, f) => n + f.diff, 0) * 100) / 100;
    const cur = r.currency as string;
    const what = found.length === 1 ? found[0]!.name : `${found.length} items`;
    const row = {
      type: 'price_drop',
      title: `Price dropped: get ${fmtMoney(total, cur)} back on ${what}`,
      description: found.map((f) => `${f.name}: you paid ${fmtMoney(f.paid, cur)}, now ${fmtMoney(f.now, cur)}`).join(' · '),
      merchant: r.merchant,
      value_estimate: total,
      currency: cur,
      expires_at: endOfDay(window.until),
      action_steps: [
        { step: `Ask ${r.merchant} for the difference before ${window.until}. Keep your receipt.` },
        { step: window.program.how_to },
        ...found.map((f) => ({ step: `Current price of ${f.name}`, url: f.url })),
        { step: 'Store policy', url: window.program.url },
      ],
    };
    // The purchase's "Price drop?" reminder becomes the real amount; never lowered, and never touched once acted on.
    const key = `price_adjust:${r.id}`;
    const { data: existing } = await db.from('opportunities').select('id, status, value_estimate, claim_started_at').eq('user_id', r.user_id).eq('dedupe_key', key).maybeSingle();
    if (existing) {
      if (existing.status !== 'open' || existing.claim_started_at || Number(existing.value_estimate ?? 0) >= total) continue;
      const { error: uErr } = await db.from('opportunities').update(row).eq('id', existing.id);
      if (uErr) report.errors.push(`update: ${uErr.message}`);
      else report.drops += 1;
    } else {
      const { error: iErr } = await db.from('opportunities').insert({ ...row, user_id: r.user_id, dedupe_key: key, source_receipt_id: r.id });
      if (iErr) report.errors.push(`insert: ${iErr.message}`);
      else report.drops += 1;
    }
  }
  return report;
}
