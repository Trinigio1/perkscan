// Perks the scout found that state a dollar amount wait here for a person before anyone sees them.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run perks:review              list what's waiting
//   … npm run perks:review -- --approve scout_us_wingstop                         publish it
//   … npm run perks:review -- --reject scout_us_wingstop                          drop it
//   … npm run perks:review -- --gaps                                              what the catalog is missing (counts)
// Check each quote against the page (the link) before approving: PerkScan never invents amounts.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service role key stays on your computer).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const [flag, id] = process.argv.slice(2);

async function main() {
  if (flag === '--approve' || flag === '--reject') {
    if (!id) throw new Error(`Usage: ${flag} <id>`);
    const { data, error } = await db.rpc('review_perk_candidate', { p_id: id, p_approve: flag === '--approve' });
    if (error) throw new Error(error.message);
    console.log(`${id}: ${data}`);
    return;
  }
  if (flag === '--gaps') {
    const { data, error } = await db.from('perk_coverage_gaps').select('*').order('users', { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    console.table(data);
    return;
  }
  const { data, error } = await db.from('perk_candidates').select('id, country, name, summary, url, evidence, found_at').eq('status', 'review').order('found_at');
  if (error) throw new Error(error.message);
  if (!data?.length) return console.log('Nothing waiting for review.');
  for (const c of data) {
    console.log(`\n${c.id}  (${c.country})\n  ${c.name}: ${c.summary}\n  Page: ${c.url}\n  Quotes: ${c.evidence}`);
  }
  console.log(`\n${data.length} waiting. Approve with --approve <id>, or --reject <id>.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
