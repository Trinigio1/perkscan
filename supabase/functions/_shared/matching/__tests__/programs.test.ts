import { doubleChargeRow, isDoubleCharge, priceAdjustment, statedWarranty, type PriceProgramIn, type PurchaseIn } from '../programs.ts';

const TODAY = '2026-10-22';
const purchase = (p: Partial<PurchaseIn>): PurchaseIn => ({
  id: 'r1', kind: 'receipt', pending: false, merchant: 'Target', total: 199.99, currency: 'USD', purchase_date: '2026-10-20',
  return_by: null, last_four: '1234', purchase_type: 'electronics', ...p,
});
const program = (p: Partial<PriceProgramIn>): PriceProgramIn => ({
  id: 'target_price_match', name: 'Target price match', countries: ['US'], merchants: ['target'], window_days: 14,
  how_to: 'Bring the receipt.', url: 'https://www.target.com/help', status: 'active', ...p,
});

describe('priceAdjustment', () => {
  it('opens a window from the purchase date when the store has a policy', () => {
    const row = priceAdjustment(purchase({}), [program({})], 'US', TODAY)!;
    expect(row.type).toBe('price_drop');
    expect(row.expires_at).toBe('2026-11-03T23:59:59Z');
    expect(row.value_estimate).toBeNull(); // only owed if the price drops
    expect(row.action_steps.at(-1)!.url).toBe('https://www.target.com/help');
  });

  it('uses the return date for "during the return period" policies, and skips it when unknown', () => {
    const bestBuy = program({ merchants: ['best buy'], window_days: null });
    expect(priceAdjustment(purchase({ merchant: 'Best Buy', return_by: '2026-11-05' }), [bestBuy], 'US', TODAY)!.expires_at).toBe('2026-11-05T23:59:59Z');
    expect(priceAdjustment(purchase({ merchant: 'Best Buy' }), [bestBuy], 'US', TODAY)).toBeNull();
  });

  it('counts a US$ purchase as a US purchase even for a user living elsewhere', () => {
    expect(priceAdjustment(purchase({}), [program({})], 'TT', TODAY)).not.toBeNull();
    expect(priceAdjustment(purchase({ currency: 'TTD' }), [program({})], 'TT', TODAY)).toBeNull();
  });

  it('ignores other stores, closed windows, pending charges and non-goods', () => {
    expect(priceAdjustment(purchase({ merchant: 'Targetted Ads LLC' }), [program({})], 'US', TODAY)).toBeNull();
    expect(priceAdjustment(purchase({ purchase_date: '2026-09-01' }), [program({})], 'US', TODAY)).toBeNull();
    expect(priceAdjustment(purchase({ pending: true }), [program({})], 'US', TODAY)).toBeNull();
    expect(priceAdjustment(purchase({ purchase_type: 'food_delivery' }), [program({})], 'US', TODAY)).toBeNull();
  });

  it("matches store names with an apostrophe", () => {
    const macys = program({ merchants: ["macy's", 'macys'], window_days: 10 });
    expect(priceAdjustment(purchase({ merchant: "Macy's" }), [macys], 'US', TODAY)).not.toBeNull();
  });
});

describe('statedWarranty', () => {
  it('counts the stated warranty from the purchase date', () => {
    const row = statedWarranty(purchase({ purchase_date: '2026-01-15' }), 24, TODAY)!;
    expect(row.expires_at).toBe('2028-01-15T23:59:59Z');
    expect(row.description).toMatch(/^2-year warranty/);
    expect(statedWarranty(purchase({}), 6, TODAY)!.description).toMatch(/^6-month warranty/);
  });

  it('needs a stated length and a purchase date, and skips warranties that already ended', () => {
    expect(statedWarranty(purchase({}), null, TODAY)).toBeNull();
    expect(statedWarranty(purchase({ purchase_date: null }), 12, TODAY)).toBeNull();
    expect(statedWarranty(purchase({ purchase_date: '2024-01-01' }), 12, TODAY)).toBeNull();
  });
});

describe('double charges', () => {
  const alert = (p: Partial<PurchaseIn>) => purchase({ kind: 'card_alert', merchant: 'UBER * EATS', total: 144.51, currency: 'TTD', last_four: '7290', ...p });

  it('flags two settled alerts for the same amount, store, card and day', () => {
    expect(isDoubleCharge(alert({ id: 'a' }), alert({ id: 'b', merchant: 'Uber Eats' }))).toBe(true);
  });

  it('leaves alone anything that differs, pending charges and store receipts', () => {
    expect(isDoubleCharge(alert({ id: 'a' }), alert({ id: 'a' }))).toBe(false);
    expect(isDoubleCharge(alert({ id: 'a' }), alert({ id: 'b', total: 50 }))).toBe(false);
    expect(isDoubleCharge(alert({ id: 'a' }), alert({ id: 'b', last_four: '0000' }))).toBe(false);
    expect(isDoubleCharge(alert({ id: 'a' }), alert({ id: 'b', purchase_date: '2026-10-21' }))).toBe(false);
    expect(isDoubleCharge(alert({ id: 'a' }), alert({ id: 'b', pending: true }))).toBe(false);
    expect(isDoubleCharge(alert({ id: 'a' }), alert({ id: 'b', merchant: 'KFC' }))).toBe(false);
    expect(isDoubleCharge(alert({ id: 'a' }), alert({ id: 'b', kind: 'receipt' }))).toBe(false);
  });

  it('asks you to check rather than claiming money is owed', () => {
    const row = doubleChargeRow(alert({}), { how_to: 'Dispute within 60 days.', url: 'https://www.consumerfinance.gov/x' });
    expect(row.type).toBe('refund');
    expect(row.value_estimate).toBeNull();
    expect(row.title).toBe('Charged twice at UBER * EATS?');
    expect(row.action_steps.map((s) => s.url).filter(Boolean)).toEqual(['https://www.consumerfinance.gov/x']);
    expect(doubleChargeRow(alert({}), null).action_steps).toHaveLength(1);
  });
});
