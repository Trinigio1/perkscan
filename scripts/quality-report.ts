// What people say PerkScan got wrong, so the biggest groups of mistakes get fixed first. Aggregates only.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run quality:report             last 30 days
//   … npm run quality:report -- 7                                                 last 7 days
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service role key stays on your computer).');
  process.exit(1);
}
const days = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 30);
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await db.rpc('_quality_report', { p_days: days });
  if (error) throw new Error(error.message);
  const r = data as { reports: number; people: number; by_kind: Record<string, number>; catalog: { ref: string; kind: string; people: number; reasons: string[] }[] };
  console.log(`\n"This is wrong" — last ${days} days: ${r.reports} reports from ${r.people} people\n`);
  const rows = Object.entries(r.by_kind).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return console.log('Nothing reported. 🎉');
  console.log('By kind and reason (fix the top ones first):');
  for (const [k, n] of rows) console.log(`  ${k.padEnd(34)} ${n}`);
  if (r.catalog.length) {
    console.log('\nCatalog entries people say are wrong (check each against the official page):');
    for (const c of r.catalog) console.log(`  ${c.ref.padEnd(48)} ${c.people} people · ${c.reasons.join(', ')}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
