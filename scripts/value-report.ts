// How much PerkScan is worth to people, month by month: aggregates across everyone, never one person.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run metrics:value                 this month
//   … npm run metrics:value -- 2026-10                                                a given month
//   … npm run metrics:value -- 2026-10 --price 9.99 --json                            plan price; raw JSON
// "Found by PerkScan" is only money people said they didn't know about. US dollars only.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service role key stays on your computer).');
  process.exit(1);
}
const args = process.argv.slice(2);
const month = args.find((a) => /^\d{4}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 7);
const priceArg = args.indexOf('--price');
const price = priceArg >= 0 ? Number(args[priceArg + 1]) : 9.99;
const db = createClient(url, key, { auth: { persistSession: false } });

interface Report {
  month: string;
  plan_price: number;
  users: number;
  users_with_new_value: number;
  users_who_recovered: number;
  users_found_at_least_plan: number;
  users_found_at_least_3x_plan: number;
  new_value: { mean: number; p25: number; median: number; p75: number };
  recovered: { mean: number; median: number };
  found_by_perkscan: { mean: number; median: number };
  answers: { found: number; knew: number; unanswered: number };
  new_by_type: Record<string, number>;
  found_by_type: Record<string, number>;
  other_currency_items: number;
}

const usd = (n: number) => `$${Number(n).toFixed(2)}`;
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');

async function main() {
  const { data, error } = await db.rpc('_value_report', { p_month: `${month}-01`, p_plan_price: price });
  if (error) throw new Error(error.message);
  const r = data as Report;
  if (args.includes('--json')) return console.log(JSON.stringify(r, null, 2));
  const answered = r.answers.found + r.answers.knew;
  console.log(`\nPerkScan value report — ${r.month} (US$ only)`);
  console.log(`${r.users} onboarded people.\n`);
  console.log(`New money put in front of people (no guesses):  median ${usd(r.new_value.median)} · mean ${usd(r.new_value.mean)} · middle half ${usd(r.new_value.p25)}–${usd(r.new_value.p75)}`);
  console.log(`  ${pct(r.users_with_new_value, r.users)} of people had some.`);
  console.log(`Money people actually used:                       median ${usd(r.recovered.median)} · mean ${usd(r.recovered.mean)}  (${pct(r.users_who_recovered, r.users)} used some)`);
  console.log(`Found by PerkScan (they didn't know about it):    median ${usd(r.found_by_perkscan.median)} · mean ${usd(r.found_by_perkscan.mean)}`);
  console.log(`  ${pct(r.users_found_at_least_plan, r.users)} of people got at least the plan price (${usd(r.plan_price)}) in money they didn't know about; ${pct(r.users_found_at_least_3x_plan, r.users)} got 3× or more.`);
  console.log(`\n"Did you know?" answers: ${r.answers.found} found by PerkScan, ${r.answers.knew} already knew, ${r.answers.unanswered} unanswered (${pct(answered, answered + r.answers.unanswered)} answered).`);
  if (answered) console.log(`  Of answered recoveries, ${pct(r.answers.found, answered)} were new to people.`);
  const show = (title: string, m: Record<string, number>) => {
    const rows = Object.entries(m).sort((a, b) => b[1] - a[1]);
    if (rows.length) console.log(`\n${title}\n${rows.map(([k, v]) => `  ${k.padEnd(16)} ${usd(v)}`).join('\n')}`);
  };
  show('New money by kind:', r.new_by_type);
  show('Found by PerkScan by kind:', r.found_by_type);
  if (r.other_currency_items) console.log(`\n(${r.other_currency_items} items in other currencies aren't in these figures.)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
