// Validates seed/card_benefits.json and writes supabase/seed.sql.
// Usage: npm run seed:build
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedFileSchema, seedToSql } from '../src/domain/seedSchema';

const root = resolve(__dirname, '..');
const input = resolve(root, 'seed/card_benefits.json');
const output = resolve(root, 'supabase/seed.sql');

const parsed = seedFileSchema.safeParse(JSON.parse(readFileSync(input, 'utf8')));
if (!parsed.success) {
  console.error('seed/card_benefits.json is invalid:');
  for (const issue of parsed.error.issues) console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

writeFileSync(output, seedToSql(parsed.data));

const benefits = parsed.data.cards.flatMap((c) => c.benefits);
const todo = benefits.filter((b) => b.status === 'TODO_VERIFY').length;
const feesTodo = parsed.data.cards.filter((c) => c.annual_fee === null).length;
console.log(`Wrote ${output}`);
console.log(`${parsed.data.cards.length} cards, ${benefits.length} benefits — ${todo} benefits and ${feesTodo} annual fees still TODO_VERIFY.`);
