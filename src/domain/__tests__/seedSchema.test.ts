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

  it('has the US cards and the Trinidad & Tobago cards', () => {
    expect(seedJson.cards.map((c: { id: string }) => c.id)).toEqual([
      'amex_platinum', 'amex_gold', 'chase_sapphire_reserve', 'chase_sapphire_preferred', 'capital_one_venture_x',
      'capital_one_savor', 'citi_strata_premier', 'chase_freedom_unlimited', 'discover_it', 'apple_card',
      'scotiabank_tt_visa_classic', 'scotiabank_tt_aero_platinum_visa', 'scotiabank_tt_gold_mastercard_cashback', 'scotiabank_tt_mastercard',
      'first_citizens_tt_visa_classic', 'first_citizens_tt_visa_gold', 'first_citizens_tt_visa_platinum', 'first_citizens_tt_purple',
      'first_citizens_tt_2_in_1', 'first_citizens_tt_vacation_lifestyle_mc',
      'republic_tt_visa_classic', 'republic_tt_visa_gold', 'republic_tt_pricesmart_visa_platinum',
      'republic_tt_aadvantage_visa_infinite', 'republic_tt_visa_signature', 'first_citizens_tt_visa_signature',
      'amex_blue_cash_preferred', 'amex_blue_cash_everyday', 'amex_green', 'amex_delta_gold', 'amex_delta_platinum', 'amex_hilton_surpass',
      'chase_freedom_flex', 'chase_prime_visa', 'chase_united_explorer', 'chase_marriott_boundless',
      'capital_one_venture', 'capital_one_quicksilver', 'citi_double_cash', 'citi_custom_cash', 'citi_costco',
      'wells_fargo_active_cash', 'wells_fargo_autograph', 'boa_customized_cash', 'boa_premium_rewards', 'target_circle_card',
    ]);
  });

  it('takes verified US card terms only from the issuer’s own site', () => {
    const own: Record<string, string> = {
      'American Express': 'americanexpress.com', Chase: 'chase.com', 'Capital One': 'capitalone.com', Citi: 'citi.com',
      Discover: 'discover.com', Apple: 'apple.com', 'Wells Fargo': 'wellsfargo.com', 'Bank of America': 'bankofamerica.com', Target: 'target.com',
    };
    for (const card of seedJson.cards.filter((c: { country: string }) => c.country === 'US')) {
      const host = Object.entries(own).find(([name]) => card.issuer.startsWith(name))![1];
      for (const item of [card, ...card.benefits].filter((x: { status: string }) => x.status === 'active')) {
        const h = new URL(item.source_url).hostname;
        expect({ id: item.id, ok: h === host || h.endsWith(`.${host}`) }).toEqual({ id: item.id, ok: true });
      }
    }
  });

  it('gives Trinidad & Tobago cards TT$ and keeps US$ coverage explicit', () => {
    const classic = seedJson.cards.find((c: { id: string }) => c.id === 'scotiabank_tt_visa_classic');
    expect(classic).toMatchObject({ country: 'TT', currency: 'TTD' });
    const mc = seedJson.cards.find((c: { id: string }) => c.id === 'scotiabank_tt_mastercard');
    expect(mc.benefits.find((b: { id: string }) => b.id.endsWith('purchase_protection')).currency).toBe('USD');
  });

  it('takes verified T&T card terms only from the bank’s own site', () => {
    const own: Record<string, string> = { Scotiabank: 'tt.scotiabank.com', 'First Citizens': 'firstcitizenstt.com', 'Republic Bank': 'republictt.com' };
    for (const card of seedJson.cards.filter((c: { country: string }) => c.country === 'TT')) {
      const host = Object.entries(own).find(([name]) => card.issuer.startsWith(name))![1];
      for (const b of card.benefits.filter((x: { status: string }) => x.status === 'active')) {
        expect(new URL(b.source_url).hostname.replace(/^www\./, '')).toBe(host);
      }
    }
  });
});

describe('seedFileSchema rules', () => {
  const base = () => JSON.parse(JSON.stringify(seedJson));
  type B = { id: string; type: string; period: string; status: string };
  type C = { status: string; benefits: B[]; annual_fee: number | null };
  // An unverified, amount-based credit and an unverified card to break the rules with.
  const todoCredit = (s: { cards: C[] }) =>
    s.cards.flatMap((c) => c.benefits).find((b) => b.status === 'TODO_VERIFY' && b.type === 'credit' && b.period !== 'per_claim') as B & Record<string, unknown>;
  const todoCard = (s: { cards: C[] }) => s.cards.find((c) => c.status === 'TODO_VERIFY')!;

  it('rejects a verified credit without an amount', () => {
    const s = base();
    Object.assign(todoCredit(s), { status: 'active', source_url: 'https://example.com', last_verified: '2026-10-01' });
    expect(seedFileSchema.safeParse(s).success).toBe(false);
  });

  it('accepts a properly verified credit', () => {
    const s = base();
    Object.assign(todoCredit(s), { amount: 15, status: 'active', source_url: 'https://example.com', last_verified: '2026-10-01' });
    expect(seedFileSchema.safeParse(s).success).toBe(true);
  });

  it('rejects an amount on a benefit still marked TODO_VERIFY', () => {
    const s = base();
    todoCredit(s).amount = 15;
    expect(seedFileSchema.safeParse(s).success).toBe(false);
  });

  it('rejects an annual fee on a card still marked TODO_VERIFY', () => {
    const s = base();
    todoCard(s).annual_fee = 100;
    expect(seedFileSchema.safeParse(s).success).toBe(false);
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
