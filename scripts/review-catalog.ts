// What the monthly card check found that needs a person: changed credit amounts and fees, new credits,
// perks no longer on the bank's page, and prices that moved too much or couldn't be found.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run catalog:review                 list what's waiting
//   … npm run catalog:review -- --apply 3f2a                                           apply it (id or its first characters)
//   … npm run catalog:review -- --dismiss 3f2a                                         it's wrong: drop it
//   … npm run catalog:review -- --recent                                               what the check changed by itself lately
// Applying updates the live database and the seed files (seed/*.json), so the next catalog build keeps it.
// Check each quote against the page (the link) first: PerkScan never invents amounts.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service role key stays on your computer).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const [flag, idArg] = process.argv.slice(2);
const today = new Date().toISOString().slice(0, 10);
const root = resolve(__dirname, '..');

interface Change {
  id: string;
  kind: string;
  card_id: string | null;
  benefit_id: string | null;
  price_id: string | null;
  summary: string;
  current: Record<string, unknown> | null;
  proposed: Record<string, unknown> | null;
  evidence: string | null;
  source_url: string | null;
  status: string;
  created_at: string;
}

type Json = Record<string, unknown>;
/** Edits a seed file in place, keeping its two-space layout. Returns whether anything matched. */
function editSeed(file: string, edit: (data: Json) => boolean): boolean {
  const path = resolve(root, file);
  const data = JSON.parse(readFileSync(path, 'utf8')) as Json;
  if (!edit(data)) return false;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return true;
}
const CARD_FILES = ['seed/card_benefits.json', 'seed/memberships.json'];
const cardsOf = (d: Json) => d.cards as Json[];
function editBenefit(id: string, patch: Json): boolean {
  return CARD_FILES.some((f) => editSeed(f, (d) => cardsOf(d).some((c) => (c.benefits as Json[]).some((b) => b.id === id && Object.assign(b, patch)))));
}
function editCard(id: string, edit: (c: Json) => void): boolean {
  return CARD_FILES.some((f) => editSeed(f, (d) => cardsOf(d).some((c) => c.id === id && (edit(c), true))));
}

async function find(prefix: string): Promise<Change> {
  const { data, error } = await db.from('catalog_changes').select('*').eq('status', 'review');
  if (error) throw new Error(error.message);
  const hits = ((data ?? []) as Change[]).filter((c) => c.id.startsWith(prefix));
  if (hits.length !== 1) throw new Error(hits.length ? `"${prefix}" matches ${hits.length} changes: use more characters` : `No open change starts with "${prefix}"`);
  return hits[0]!;
}

async function must(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(error.message);
}

async function apply(c: Change) {
  const p = c.proposed ?? {};
  const source = c.source_url;
  switch (c.kind) {
    case 'amount_changed':
    case 'amount_found': {
      const amount = Number(p.amount);
      await must(db.from('card_benefits').update({ amount, status: 'active', last_verified: today }).eq('id', c.benefit_id!));
      if (!editBenefit(c.benefit_id!, { amount, status: 'active', last_verified: today })) console.warn(`(${c.benefit_id} isn't in the seed files: database only)`);
      break;
    }
    case 'fee_changed': {
      const fee = Number(p.annual_fee);
      await must(db.from('cards').update({ annual_fee: fee, status: 'active', last_verified: today }).eq('id', c.card_id!));
      editCard(c.card_id!, (card) => Object.assign(card, { annual_fee: fee, status: 'active', last_verified: today, source_url: card.source_url ?? source }));
      break;
    }
    case 'new_credit': {
      const slug = String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
      const row = {
        id: `${c.card_id}__${slug}`, type: p.type ?? 'credit', name: p.name, amount: p.amount, period: p.period ?? 'per_claim', period_anchor: 'calendar', amount_schedule: null,
        terms_summary: (c.evidence ?? '').slice(0, 300) || null, max_coverage: null, coverage_window_days: null, enrollment_required: false, merchant_match: null, currency: null,
        status: 'active', source_url: source, last_verified: today, notes: 'Found by the monthly card check; approved in review.',
      };
      await must(db.from('card_benefits').upsert({ ...row, card_id: c.card_id }, { onConflict: 'id' }));
      editCard(c.card_id!, (card) => {
        const list = card.benefits as Json[];
        if (!list.some((b) => b.id === row.id)) list.push(row);
      });
      break;
    }
    case 'not_on_page': {
      // Gone from the bank's page: no longer shown as confirmed, and no amount counts.
      const note = `Not found on the bank's page on ${today} (monthly card check).`;
      await must(db.from('card_benefits').update({ status: 'TODO_VERIFY', amount: null, notes: note }).eq('id', c.benefit_id!));
      editBenefit(c.benefit_id!, { status: 'TODO_VERIFY', amount: null, amount_schedule: null, max_coverage: null, last_verified: null, notes: note });
      break;
    }
    case 'price_changed': {
      const amount = Number(p.amount);
      await must(db.from('perk_prices').update({ amount, last_verified: today, check_result: 'updated' }).eq('id', c.price_id!));
      editSeed('seed/perk_prices.json', (d) => (d.prices as Json[]).some((x) => x.id === c.price_id && Object.assign(x, { amount, last_verified: today })));
      break;
    }
    case 'price_unconfirmed':
      console.log(`Nothing to apply automatically: fix ${c.price_id}'s source_url or amount in seed/perk_prices.json, then rebuild the catalog.`);
      break;
    default:
      throw new Error(`Don't know how to apply ${c.kind}`);
  }
  await must(db.from('catalog_changes').update({ status: 'applied', decided_at: new Date().toISOString() }).eq('id', c.id));
}

async function main() {
  if (flag === '--apply' || flag === '--dismiss') {
    if (!idArg) throw new Error(`Usage: ${flag} <id>`);
    const c = await find(idArg);
    if (flag === '--apply') await apply(c);
    else await must(db.from('catalog_changes').update({ status: 'dismissed', decided_at: new Date().toISOString() }).eq('id', c.id));
    console.log(`${c.id.slice(0, 8)} ${flag === '--apply' ? 'applied' : 'dismissed'}: ${c.summary}`);
    if (flag === '--apply') console.log('Then: npm run seed:build -- --migration, and commit the seed files and the new migration.');
    return;
  }
  const recent = flag === '--recent';
  let q = db.from('catalog_changes').select('*').order('created_at').limit(200);
  q = recent ? q.eq('status', 'applied').gte('created_at', new Date(Date.now() - 45 * 86_400_000).toISOString()) : q.eq('status', 'review');
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Change[];
  if (!rows.length) return console.log(recent ? 'The check changed nothing by itself in the last 45 days.' : 'Nothing waiting for review.');
  for (const c of rows) {
    console.log(`\n${c.id.slice(0, 8)}  ${c.kind}  ${c.card_id ?? c.price_id ?? ''}\n  ${c.summary}${c.evidence ? `\n  Quote: "${c.evidence}"` : ''}${c.source_url ? `\n  Page: ${c.source_url}` : ''}`);
  }
  if (!recent) console.log(`\n${rows.length} waiting. Check the quote on the page, then --apply <id> or --dismiss <id>.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
