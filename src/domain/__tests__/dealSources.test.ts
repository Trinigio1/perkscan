import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dealSourceFileSchema, dealSourcesToSql } from '../catalogSchema';

const read = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../seed', f), 'utf8'));

describe('seed/deal_sources.json', () => {
  const file = dealSourceFileSchema.parse(read('deal_sources.json'));
  const issuers = new Set((read('card_benefits.json').cards as { issuer: string }[]).map((c) => c.issuer));

  it('names only issuers PerkScan knows', () => {
    for (const s of file.sources) for (const i of s.issuers) expect(issuers).toContain(i);
  });

  it('has unique ids and pages', () => {
    expect(new Set(file.sources.map((s) => s.id)).size).toBe(file.sources.length);
    expect(new Set(file.sources.map((s) => s.url)).size).toBe(file.sources.length);
  });

  it('covers the US and Trinidad & Tobago', () => {
    expect(file.sources.some((s) => s.countries.includes('US') && s.kind === 'store')).toBe(true);
    expect(file.sources.some((s) => s.countries.includes('TT') && s.kind === 'store')).toBe(true);
  });

  it('never overwrites the scout’s bookkeeping', () => {
    const sql = dealSourcesToSql(file).join('\n');
    expect(sql).not.toMatch(/last_checked|last_status|failures|found_via/);
  });

  it('rejects stores without a category or a name to match', () => {
    const bad = { id: 'x', name: 'X', kind: 'store', url: 'https://x.example', countries: ['US'], regions: [], categories: [], merchants: [], issuers: [], card_keywords: [], active: true, found_via: 'test' };
    expect(dealSourceFileSchema.safeParse({ sources: [bad] }).success).toBe(false);
  });
});
