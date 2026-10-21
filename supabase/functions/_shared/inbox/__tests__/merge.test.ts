import { findDuplicate, mergeFields, sameMerchant, type ExistingReceipt } from '../merge.ts';
import type { ReceiptRow } from '../opportunities.ts';

const row = (r: Partial<ReceiptRow>): ReceiptRow => ({
  kind: 'card_alert', pending: true, merchant: 'Uber Eats', total: 144.51, currency: 'TTD', purchase_type: 'food_delivery',
  travel_date: null, purchase_date: '2026-10-20', last_four: '0000', items: [], order_number: null, return_by: null, category: null, ...r,
});
const existing = (e: Partial<ExistingReceipt>): ExistingReceipt => ({
  id: 'r1', kind: 'receipt', pending: false, merchant: 'Uber Eats', total: 144.51, currency: 'TTD', purchase_date: '2026-10-20',
  last_four: null, order_number: 'U-1', ...e,
});

describe('sameMerchant', () => {
  it.each([
    ['UBER * EATS', 'Uber Eats'],
    ['COURTS TRINIDAD', 'Courts'],
    ['UBER *TRIP', 'Uber'],
    ['PriceSmart', 'PRICESMART #321'],
  ])('%p ~ %p', (a, b) => expect(sameMerchant(a, b)).toBe(true));
  it('tells different stores apart', () => {
    expect(sameMerchant('Massy Stores', 'Uber Eats')).toBe(false);
    expect(sameMerchant('KFC', 'Courts')).toBe(false);
  });
});

describe('findDuplicate', () => {
  it('pairs an alert with the store receipt for the same purchase', () => {
    expect(findDuplicate(row({}), [existing({})])?.id).toBe('r1');
    // and the other way round, a day apart
    expect(findDuplicate(row({ kind: 'receipt', pending: false, purchase_date: '2026-10-21' }), [existing({ kind: 'card_alert', pending: true })])?.id).toBe('r1');
  });
  it('needs the same amount, currency and nearby dates', () => {
    expect(findDuplicate(row({ total: 144.5 }), [existing({})])).toBeNull();
    expect(findDuplicate(row({ currency: 'USD' }), [existing({})])).toBeNull();
    expect(findDuplicate(row({ purchase_date: '2026-10-25' }), [existing({})])).toBeNull();
  });
  it('never merges across different cards', () => {
    expect(findDuplicate(row({ last_four: '1111' }), [existing({ last_four: '2222' })])).toBeNull();
  });
  it('merges a settled alert into its pending one, but not two receipts', () => {
    expect(findDuplicate(row({ pending: false }), [existing({ kind: 'card_alert', pending: true, last_four: '0000' })])?.id).toBe('r1');
    expect(findDuplicate(row({ pending: true }), [existing({ kind: 'card_alert', pending: true, last_four: '0000' })])).toBeNull();
    expect(findDuplicate(row({ kind: 'receipt', pending: false }), [existing({})])).toBeNull();
  });
});

describe('mergeFields', () => {
  it('keeps the store receipt and takes the card digits from the alert', () => {
    expect(mergeFields(existing({}), row({}))).toEqual({ last_four: '0000', pending: false });
  });
  it('lets a later store receipt take over an alert, keeping its card digits', () => {
    const out = mergeFields(existing({ kind: 'card_alert', pending: true, last_four: '0000', merchant: 'UBER * EATS' }), row({ kind: 'receipt', pending: false, last_four: null, order_number: 'U-9' }));
    expect(out).toMatchObject({ kind: 'receipt', pending: false, last_four: '0000', merchant: 'Uber Eats', order_number: 'U-9' });
  });
});
