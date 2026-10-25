import { checkoutStack, guessCategory, knownMerchants } from '../checkout';
import { opp } from '../__fixtures__/opportunities';
import type { Card, CardBenefit, Receipt, UserCard } from '../types';

const NOW = new Date('2026-10-20T12:00:00Z');
const card = (id: string, currency = 'USD'): Card => ({
  id, kind: 'card', issuer: 'Bank', product_name: id, country: currency === 'TTD' ? 'TT' : 'US', currency, annual_fee: null,
  status: 'TODO_VERIFY', source_url: null, last_verified: null, sort_order: 0,
});
const benefit = (b: Partial<CardBenefit> & Pick<CardBenefit, 'id' | 'card_id' | 'type'>): CardBenefit => ({
  name: b.id, amount: null, period: 'monthly', period_anchor: 'calendar', amount_schedule: null, terms_summary: null, max_coverage: null,
  coverage_window_days: null, enrollment_required: false, merchant_match: null, currency: null, status: 'TODO_VERIFY', source_url: null,
  last_verified: null, notes: null, sort_order: 0, ...b,
});
const uc = (id: string, card_id: string): UserCard => ({ id, user_id: 'u1', card_id, last_four: '1111', open_date: null, nickname: null, created_at: '' });
const receipt = (r: Partial<Receipt>): Receipt => ({
  id: 'r', merchant: 'Store', total: 10, currency: 'USD', purchase_date: '2026-10-01', last_four: null, purchase_type: null,
  matched_user_card_id: null, kind: 'receipt', pending: false, ...r,
});

const cards = [card('gold'), card('scotia', 'TTD')];
const benefits = [
  benefit({ id: 'gold__uber_cash', card_id: 'gold', type: 'credit', name: 'Uber Cash', merchant_match: { merchants: ['uber', 'uber eats'] } }),
  benefit({ id: 'gold__purchase_protection', card_id: 'gold', type: 'protection' }),
  benefit({ id: 'scotia__price_protection', card_id: 'scotia', type: 'protection' }),
  benefit({ id: 'scotia__extended_warranty', card_id: 'scotia', type: 'protection' }),
];
const userCards = [uc('uc-gold', 'gold'), uc('uc-scotia', 'scotia')];
const base = { cards, benefits, userCards, receipts: [] as Receipt[], recoveredByOpp: new Map<string, number>(), now: NOW, money: (n: number, c: string) => `${c} ${n}` };

describe('checkoutStack', () => {
  it('picks the card with an unused credit at this store', () => {
    const credit = opp({ id: 'c1', user_card_id: 'uc-gold', benefit_id: 'gold__uber_cash', value_estimate: 10, expires_at: '2026-11-01T00:00:00Z' });
    const s = checkoutStack('UBER * EATS', 'delivery_rides', { ...base, opportunities: [credit], recoveredByOpp: new Map([['c1', 3]]) });
    expect(s.best?.userCardId).toBe('uc-gold');
    expect(s.best?.reasons[0]).toMatchObject({ kind: 'credit', text: 'Uber Cash: USD 7 left this period' });
  });

  it('skips credits already used up or expired', () => {
    const used = opp({ id: 'c1', user_card_id: 'uc-gold', benefit_id: 'gold__uber_cash', value_estimate: 10, expires_at: '2026-11-01T00:00:00Z' });
    const s = checkoutStack('Uber', 'delivery_rides', { ...base, opportunities: [used], recoveredByOpp: new Map([['c1', 10]]) });
    expect(s.best).toBeNull();
  });

  it('weighs protections for the kind of purchase', () => {
    const s = checkoutStack('Courts', 'electronics', { ...base, opportunities: [] });
    expect(s.best?.userCardId).toBe('uc-scotia'); // price protection + extended warranty beats purchase protection alone
    expect(s.best?.reasons.map((r) => r.text)).toEqual(['Price protection (terms not verified)', 'Extended warranty (terms not verified)']);
  });

  it('flags a currency mismatch without inventing a fee, and calls a tie a tie', () => {
    const s = checkoutStack('Amazon', 'other', { ...base, opportunities: [], receipts: [receipt({ merchant: 'Amazon', currency: 'USD' })] });
    expect(s.merchantCurrency).toBe('USD');
    expect(s.cards.find((c) => c.userCardId === 'uc-scotia')?.reasons[0]).toMatchObject({ kind: 'currency', tone: 'warn' });
    expect(s.best).toBeNull(); // currency alone never makes a card "best"
  });

  it('lists open promos and store credit for the store only', () => {
    const promo = opp({ id: 'p1', type: 'promo', category: 'promos', merchant: 'KFC Trinidad', user_card_id: null, benefit_id: null, expires_at: '2026-10-25T00:00:00Z' });
    const otherPromo = opp({ id: 'p2', type: 'promo', category: 'promos', merchant: 'Shein', user_card_id: null, benefit_id: null });
    const expired = opp({ id: 'p3', type: 'promo', category: 'promos', merchant: 'KFC', user_card_id: null, benefit_id: null, expires_at: '2026-10-01T00:00:00Z' });
    const gift = opp({ id: 'g1', type: 'gift_card', category: 'store_credit_gift_cards', merchant: 'KFC', user_card_id: null, benefit_id: null });
    const s = checkoutStack('KFC', 'dining', { ...base, opportunities: [promo, otherPromo, expired, gift] });
    expect(s.promos.map((o) => o.id)).toEqual(['p1']);
    expect(s.storeCredit.map((o) => o.id)).toEqual(['g1']);
  });
});

describe('guessCategory', () => {
  it('uses your last receipt at the store, then the name', () => {
    expect(guessCategory('Courts', [receipt({ merchant: 'COURTS TRINIDAD', purchase_type: 'appliance' })])).toBe('electronics');
    expect(guessCategory('Uber Eats', [])).toBe('delivery_rides');
    expect(guessCategory('Massy Stores', [])).toBe('groceries');
    expect(guessCategory('Somewhere Unknown', [])).toBe('other');
  });
});

describe('knownMerchants', () => {
  it('collects stores from receipts, offers and credits without duplicates', () => {
    expect(knownMerchants([receipt({ merchant: 'Courts' })], [opp({ merchant: 'courts' })], benefits)).toEqual(['Courts', 'Uber', 'Uber Eats']);
  });
});
