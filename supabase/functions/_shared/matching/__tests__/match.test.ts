import { matchReceipt, merchantMatches, MIN_GOODS_TOTAL, protectionKind, type BenefitIn, type OpenCreditIn, type ReceiptIn, type UserCardIn } from '../match.ts';

const TODAY = '2026-10-21';
const receipt = (r: Partial<ReceiptIn>): ReceiptIn => ({
  id: 'r1', merchant: 'Gadget Hub', total: 899, currency: 'USD', purchase_date: '2026-10-10',
  last_four: '1234', purchase_type: 'electronics', travel_date: null, ...r,
});
const cards: UserCardIn[] = [
  { id: 'uc-gold', card_id: 'gold', last_four: '1234', label: 'Gold Card ending 1234' },
  { id: 'uc-tt', card_id: 'tt_classic', last_four: '5678', label: 'Scotiabank Visa Classic ending 5678' },
];
const benefit = (b: Partial<BenefitIn> & { id: string }): BenefitIn => ({
  card_id: 'gold', type: 'protection', name: b.id, max_coverage: null, coverage_window_days: null,
  currency: 'USD', status: 'TODO_VERIFY', merchant_match: null, source_url: null, ...b,
});
const goldBenefits: BenefitIn[] = [
  benefit({ id: 'gold__purchase_protection', max_coverage: 1000, coverage_window_days: 90, status: 'active', source_url: 'https://issuer.example/terms' }),
  benefit({ id: 'gold__extended_warranty' }),
  benefit({ id: 'gold__cell_phone' }),
  benefit({ id: 'gold__trip_delay' }),
  benefit({ id: 'gold__rental_car' }),
  benefit({ id: 'gold__uber_cash', type: 'credit', merchant_match: { merchants: ['uber', 'uber eats'] } }),
];
const ttBenefits: BenefitIn[] = [benefit({ id: 'tt_classic__price_protection', card_id: 'tt_classic', currency: 'USD' })];
const all = [...goldBenefits, ...ttBenefits];

describe('card matching', () => {
  it('matches by last four', () => {
    expect(matchReceipt(receipt({}), cards, all, [], TODAY)).toMatchObject({ userCardId: 'uc-gold', match: 'last_four' });
  });
  it('does nothing without last four or with an unknown card', () => {
    expect(matchReceipt(receipt({ last_four: null }), cards, all, [], TODAY)).toMatchObject({ userCardId: null, match: 'no_last_four', protections: [] });
    expect(matchReceipt(receipt({ last_four: '0000' }), cards, all, [], TODAY).match).toBe('no_card');
  });
  it('refuses to guess between two cards with the same last four', () => {
    const twins = [...cards, { id: 'uc-other', card_id: 'gold', last_four: '1234', label: 'Other' }];
    expect(matchReceipt(receipt({}), twins, all, [], TODAY)).toMatchObject({ userCardId: null, match: 'ambiguous' });
  });
});

describe('protections', () => {
  it('purchase protection with verified terms: deadline and limit, never a dollar value', () => {
    const { protections } = matchReceipt(receipt({}), cards, all, [], TODAY);
    const pp = protections.find((p) => p.benefit_id === 'gold__purchase_protection')!;
    expect(pp).toMatchObject({ expires_at: '2027-01-08T23:59:59Z', value_estimate: null, currency: 'USD', dedupe_key: 'protection:purchase_protection:r1' });
    expect(pp.description).toContain('Covered up to US$1000 per claim.');
    expect(pp.description).not.toContain('haven’t verified');
    expect(pp.action_steps.map((s) => s.step).join(' ')).toContain('ending 1234');
    expect(pp.action_steps.some((s) => s.url === 'https://issuer.example/terms')).toBe(true);
  });

  it('extended warranty for electronics, flagged as unverified', () => {
    const { protections } = matchReceipt(receipt({}), cards, all, [], TODAY);
    const ew = protections.find((p) => p.benefit_id === 'gold__extended_warranty')!;
    expect(ew.expires_at).toBeNull();
    expect(ew.description).toContain('haven’t verified');
  });

  it('skips purchase protection once the window has passed', () => {
    const { protections } = matchReceipt(receipt({ purchase_date: '2026-06-01' }), cards, all, [], TODAY);
    expect(protections.some((p) => p.benefit_id === 'gold__purchase_protection')).toBe(false);
  });

  it('skips small purchases and services', () => {
    expect(matchReceipt(receipt({ total: MIN_GOODS_TOTAL - 1 }), cards, all, [], TODAY).protections).toHaveLength(0);
    expect(matchReceipt(receipt({ purchase_type: 'restaurant' }), cards, all, [], TODAY).protections).toHaveLength(0);
  });

  it('phone bill paid with the card -> one phone protection per card', () => {
    const { protections } = matchReceipt(receipt({ purchase_type: 'phone_bill', merchant: 'Digicel', total: 30 }), cards, all, [], TODAY);
    expect(protections).toHaveLength(1);
    expect(protections[0]).toMatchObject({ benefit_id: 'gold__cell_phone', dedupe_key: 'protection:cell_phone:uc-gold' });
  });

  it('upcoming flight -> trip delay until two days after departure', () => {
    const { protections } = matchReceipt(receipt({ purchase_type: 'flight', merchant: 'Caribbean Airlines', travel_date: '2026-11-15' }), cards, all, [], TODAY);
    expect(protections.map((p) => p.benefit_id)).toEqual(['gold__trip_delay']);
    expect(protections[0]!.expires_at).toBe('2026-11-17T23:59:59Z');
  });

  it('past flights and past rentals are ignored', () => {
    expect(matchReceipt(receipt({ purchase_type: 'flight', travel_date: '2026-09-01' }), cards, all, [], TODAY).protections).toHaveLength(0);
    expect(matchReceipt(receipt({ purchase_type: 'car_rental', travel_date: '2026-10-01' }), cards, all, [], TODAY).protections).toHaveLength(0);
  });

  it('notes when coverage is in a different currency than the receipt', () => {
    const tt = matchReceipt(receipt({ last_four: '5678', currency: 'TTD', total: 2500 }), cards, all, [], TODAY);
    expect(tt.protections.map((p) => p.benefit_id)).toEqual(['tt_classic__price_protection']);
    const withLimit = [benefit({ id: 'tt_classic__price_protection', card_id: 'tt_classic', currency: 'USD', max_coverage: 200 })];
    const desc = matchReceipt(receipt({ last_four: '5678', currency: 'TTD', total: 2500 }), cards, withLimit, [], TODAY).protections[0]!.description;
    expect(desc).toContain('Covered up to US$200 per claim (your receipt is in TTD).');
  });

  it('only uses protections the matched card actually has', () => {
    const tt = matchReceipt(receipt({ last_four: '5678', purchase_type: 'flight', travel_date: '2026-11-15' }), cards, all, [], TODAY);
    expect(tt.protections).toHaveLength(0);
  });
});

describe('credits', () => {
  const credit: OpenCreditIn = { id: 'opp-uber', user_card_id: 'uc-gold', benefit_id: 'gold__uber_cash', period_start: '2026-10-01', expires_at: '2026-11-01T04:00:00Z', currency: 'USD' };

  it('an Uber receipt on the right card uses the Uber credit', () => {
    const m = matchReceipt(receipt({ merchant: 'Uber Eats', purchase_type: 'food_delivery', total: 23.5 }), cards, all, [credit], TODAY);
    expect(m.creditUses).toEqual([{ opportunityId: 'opp-uber', amount: 23.5 }]);
  });

  it('ignores other merchants, other cards, other periods and other currencies', () => {
    expect(matchReceipt(receipt({ merchant: 'Lyft', purchase_type: 'rideshare' }), cards, all, [credit], TODAY).creditUses).toHaveLength(0);
    expect(matchReceipt(receipt({ merchant: 'Uber', last_four: '5678' }), cards, all, [credit], TODAY).creditUses).toHaveLength(0);
    expect(matchReceipt(receipt({ merchant: 'Uber', purchase_date: '2026-09-30' }), cards, all, [credit], TODAY).creditUses).toHaveLength(0);
    expect(matchReceipt(receipt({ merchant: 'Uber', currency: 'TTD' }), cards, all, [credit], TODAY).creditUses).toHaveLength(0);
  });
});

describe('helpers', () => {
  it('protectionKind reads the catalog id suffix', () => {
    expect(protectionKind('amex_gold__purchase_protection')).toBe('purchase_protection');
    expect(protectionKind('amex_gold__uber_cash')).toBeNull();
  });
  it('merchantMatches is word-based and case-insensitive', () => {
    expect(merchantMatches('UBER *TRIP', ['uber'])).toBe(true);
    expect(merchantMatches('Suber Shop', ['uber'])).toBe(false);
  });
});
