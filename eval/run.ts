// Runs every case in eval/cases through the real reader (Claude) and scores it.
//
//   ANTHROPIC_API_KEY=… npm run eval            (PowerShell: $env:ANTHROPIC_API_KEY="…"; npm run eval)
//
// Costs roughly US$0.0005 per case. Results are printed and saved to eval/results/ (not committed).
import { claudeModelCall, MODEL } from '../supabase/functions/_shared/inbox/claude.ts';
import { buildModelInput } from '../supabase/functions/_shared/inbox/clean.ts';
import { costUsd, parseEmail } from '../supabase/functions/_shared/inbox/parse.ts';
import { PROMPT_VERSION } from '../supabase/functions/_shared/inbox/prompt.ts';
import { scoreCase, summarize, type Check, type EvalCase } from './score.ts';

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) {
  console.error('Set ANTHROPIC_API_KEY for this terminal first (it is not read from any file).');
  Deno.exit(1);
}
const only = Deno.args.find((a) => !a.startsWith('--'));

const dir = new URL('./cases/', import.meta.url);
const cases: EvalCase[] = [];
for await (const f of Deno.readDir(dir)) {
  if (!f.name.endsWith('.json') || (only && !f.name.includes(only))) continue;
  cases.push({ ...(JSON.parse(await Deno.readTextFile(new URL(f.name, dir))) as EvalCase), name: f.name.replace(/\.json$/, '') });
}
cases.sort((a, b) => a.name.localeCompare(b.name));

let cost = 0;
const results: { name: string; origin: string; checks: Check[] | null; error?: string }[] = [];
for (const c of cases) {
  const day = c.input.date.slice(0, 10);
  const call = claudeModelCall(apiKey, () => day);
  const r = await parseEmail(buildModelInput(c.input), call);
  cost += costUsd(r.usage);
  if (!r.ok) {
    results.push({ name: c.name, origin: c.origin, checks: null, error: r.error });
    console.log(`✗ ${c.name}: could not parse (${r.error})`);
    continue;
  }
  const checks = scoreCase(c.expected, r.data);
  results.push({ name: c.name, origin: c.origin, checks });
  const wrong = checks.filter((x) => !x.ok);
  console.log(`${wrong.length ? '✗' : '✓'} ${c.name}`);
  for (const w of wrong) console.log(`    ${w.field}: expected ${JSON.stringify(w.expected)}, got ${JSON.stringify(w.actual)}`);
}

const s = summarize(results);
console.log(`\n${s.casesRight}/${s.cases} cases fully right · reader ${MODEL}/${PROMPT_VERSION} · cost about US$${cost.toFixed(4)}`);
console.log('\nField                  right / total');
for (const f of s.fields) console.log(`${f.field.padEnd(22)} ${String(f.right).padStart(5)} / ${f.total}  (${Math.round((f.right / f.total) * 100)}%)`);

await Deno.mkdir(new URL('./results/', import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await Deno.writeTextFile(
  new URL(`./results/${stamp}.json`, import.meta.url),
  JSON.stringify({ reader: `${MODEL}/${PROMPT_VERSION}`, at: new Date().toISOString(), costUsd: cost, summary: s, results }, null, 2),
);
