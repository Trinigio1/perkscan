import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedFileSchema, seedToSql } from '../seedSchema';

const seedJson = JSON.parse(readFileSync(resolve(__dirname, '../../../seed/card_benefits.json'), 'utf8'));

describe('seed/card_benefits.json', () => {
  it('is valid', () => {
    const r = seedFileSchema.safeParse(seedJson);
    if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
  });

  it('never contains an amount that is not marked verified', () => {
    for (const card of seedJson.cards) {
      if (card.annual_fee !== null) expect(card.status).toBe('active');
      for (const b of card.benefits) {
        if (b.amount !== null) expect({ id: b.id, status: b.status }).toEqual({ id: b.id, status: 'active' });
      }
    }
  });

  it('has the 10 launch cards', () => {
    expect(seedJson.cards.map((c: { id: string }) => c.id)).toEqual([
      'amex_platinum', 'amex_gold', 'chase_sapphire_reserve', 'chase_sapphire_preferred', 'capital_one_venture_x',
      'capital_one_savor', 'citi_strata_premier', 'chase_freedom_unlimited', 'discover_it', 'apple_card',
    ]);
  });
});

describe('seedFileSchema rules', () => {
  const base = () => JSON.parse(JSON.stringify(seedJson));

  it('rejects a verified credit without an amount', () => {
    const s = base();
    Object.assign(s.cards[0].benefits[0], { status: 'active', source_url: 'https://example.com', last_verified: '2026-10-01' });
    expect(seedFileSchema.safeParse(s).success).toBe(false);
  });

  it('accepts a properly verified credit', () => {
    const s = base();
    Object.assign(s.cards[0].benefits[0], { amount: 15, status: 'active', source_url: 'https://example.com', last_verified: '2026-10-01' });
    expect(seedFileSchema.safeParse(s).success).toBe(true);
  });

  it('rejects duplicate ids and mismatched prefixes', () => {
    const s = base();
    s.cards[0].benefits.push({ ...s.cards[0].benefits[0] });
    expect(seedFileSchema.safeParse(s).success).toBe(false);
    const t = base();
    t.cards[0].benefits[0].id = 'amex_gold__oops';
    expect(seedFileSchema.safeParse(t).success).toBe(false);
  });
});

describe('seedToSql', () => {
  it('escapes quotes and emits jsonb', () => {
    const sql = seedToSql(seedFileSchema.parse(seedJson));
    expect(sql).toContain("'Dunkin'' credit'");
    expect(sql).toContain('::jsonb');
    expect(sql.startsWith('-- GENERATED')).toBe(true);
  });
});
