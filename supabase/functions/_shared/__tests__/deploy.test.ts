import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Supabase bundles each function with its own deno.json (where "@supabase/supabase-js" and friends come
// from). A function without one deploys with "Relative import path … not prefixed" and fails.
const root = join(__dirname, '..', '..');
const fns = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(root, d.name, 'index.ts')));

describe('every edge function can be deployed', () => {
  const reference = readFileSync(join(root, 'ingest', 'deno.json'), 'utf8');
  it.each(fns.map((d) => d.name))('%s has the shared deno.json', (name) => {
    const file = join(root, name, 'deno.json');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(reference);
  });
});
