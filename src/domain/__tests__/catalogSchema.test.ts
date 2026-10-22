import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { settlementFileSchema, settlementsToSql, studentFileSchema, studentToSql } from '../catalogSchema';

const read = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../seed', f), 'utf8'));
const offer = {
  id: 'x', name: 'X', provider: 'X', category: 'software', summary: 'Free', eligibility: 'Students', how_to_verify: 'Email',
  url: 'https://x.example.com', countries: [], status: 'active', source_url: 'https://x.example.com', last_verified: '2026-10-22',
};
const settlement = {
  id: 'x', name: 'X', description: 'X', eligible_merchants: ['acme'], eligible_products: 'Things', purchase_start: '2026-01-01',
  purchase_end: '2026-06-30', claim_deadline: '2026-12-31', claim_url: 'https://claims.example.com', proof_required: 'Receipt',
  eligible_countries: ['US'], payout_note: null, status: 'active', source_url: 'https://claims.example.com', last_verified: '2026-10-22',
};

describe('student offers file', () => {
  it('the shipped file is valid and every active offer has a source and check date', () => {
    const f = studentFileSchema.parse(read('student_discounts.json'));
    expect(f.offers.length).toBeGreaterThan(0);
    for (const o of f.offers.filter((x) => x.status === 'active')) expect(o.source_url && o.last_verified).toBeTruthy();
  });
  it('rejects an active offer without a source, and non-https links', () => {
    expect(studentFileSchema.safeParse({ offers: [{ ...offer, source_url: null }] }).success).toBe(false);
    expect(studentFileSchema.safeParse({ offers: [{ ...offer, url: 'http://x.example.com' }] }).success).toBe(false);
  });
  it('writes text arrays for countries', () => {
    expect(studentToSql({ offers: [{ ...offer, countries: ['US', 'CA'] }] as never })[0]).toContain("array['US', 'CA']::text[]");
  });
});

describe('settlements file', () => {
  it('the shipped file is valid', () => {
    expect(settlementFileSchema.safeParse(read('settlements.json')).success).toBe(true);
  });
  it('needs official https links, lowercase store names and sane dates', () => {
    expect(settlementFileSchema.safeParse({ settlements: [settlement] }).success).toBe(true);
    expect(settlementFileSchema.safeParse({ settlements: [{ ...settlement, claim_url: 'http://claims.example.com' }] }).success).toBe(false);
    expect(settlementFileSchema.safeParse({ settlements: [{ ...settlement, eligible_merchants: ['Acme'] }] }).success).toBe(false);
    expect(settlementFileSchema.safeParse({ settlements: [{ ...settlement, purchase_end: '2025-01-01' }] }).success).toBe(false);
  });
  it('generates an idempotent upsert', () => {
    const sql = settlementsToSql({ settlements: [settlement] as never })[0]!;
    expect(sql).toContain("array['acme']::text[]");
    expect(sql).toContain('on conflict (id) do update set');
  });
});
