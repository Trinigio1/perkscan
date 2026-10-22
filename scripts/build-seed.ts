// Validates the curated lists in seed/ and writes supabase/seed.sql.
// Usage: npm run seed:build
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ZodType } from 'zod';
import {
  settlementFileSchema, settlementsToSql, studentFileSchema, studentToSql, universitiesToSql, universityFileSchema, unknownUniversityIds,
} from '../src/domain/catalogSchema';
import { seedFileSchema, seedToSql } from '../src/domain/seedSchema';

const root = resolve(__dirname, '..');
const output = resolve(root, 'supabase/seed.sql');

function load<T>(file: string, schema: ZodType<T>): T {
  const parsed = schema.safeParse(JSON.parse(readFileSync(resolve(root, file), 'utf8')));
  if (!parsed.success) {
    console.error(`${file} is invalid:`);
    for (const issue of parsed.error.issues) console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
    process.exit(1);
  }
  return parsed.data;
}

const cards = load('seed/card_benefits.json', seedFileSchema);
const students = load('seed/student_discounts.json', studentFileSchema);
const settlements = load('seed/settlements.json', settlementFileSchema);
const universities = load('seed/universities.json', universityFileSchema);
const unknown = unknownUniversityIds(students, universities);
if (unknown.length) {
  console.error(`seed/student_discounts.json points at schools that aren't in seed/universities.json: ${unknown.join(', ')}`);
  process.exit(1);
}

// seedToSql wraps the cards in begin/commit; the other lists go inside the same transaction.
const sql = seedToSql(cards).replace(/commit;\n$/, [
  '-- Schools (seed/universities.json)',
  ...universitiesToSql(universities),
  '-- Student offers (seed/student_discounts.json)',
  ...studentToSql(students),
  '-- Settlements (seed/settlements.json)',
  ...settlementsToSql(settlements),
  'commit;',
  '',
].join('\n'));
writeFileSync(output, sql);

const benefits = cards.cards.flatMap((c) => c.benefits);
const todo = benefits.filter((b) => b.status === 'TODO_VERIFY').length;
const feesTodo = cards.cards.filter((c) => c.annual_fee === null).length;
console.log(`Wrote ${output}`);
console.log(`${cards.cards.length} cards, ${benefits.length} benefits — ${todo} benefits and ${feesTodo} annual fees still TODO_VERIFY.`);
console.log(`${universities.universities.length} schools, ${students.offers.length} student offers, ${settlements.settlements.length} settlements.`);
