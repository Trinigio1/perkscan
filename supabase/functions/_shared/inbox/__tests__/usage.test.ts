import { usageFrom, type OpenItem, type UsageReceipt } from '../usage.ts';

const item = (o: Partial<OpenItem>): OpenItem => ({
  id: 'o1', type: 'promo', title: '25% off your next order', merchant: 'Uber Eats', code: null, value_estimate: null,
  currency: 'USD', expires_at: null, seen_on: '2026-10-01T09:00:00Z', used_guess_declined_at: null, ...o,
});
const receipt = (r: Partial<UsageReceipt>): UsageReceipt => ({ merchant: 'Uber Eats', purchase_date: '2026-10-20', currency: 'USD', discounts: [], ...r });

describe('usageFrom', () => {
  it('marks an offer used when the receipt shows its code', () => {
    const r = receipt({ discounts: [{ description: 'Promo EATS25XL6', code: 'EATS25XL6', amount: 6.2 }] });
    expect(usageFrom(r, [item({ code: 'eats25xl6' })])).toEqual([{ id: 'o1', amount: 6.2, how: 'used', line: 'Promo EATS25XL6' }]);
  });

  it('needs the same store for short codes, but trusts a long specific code anywhere', () => {
    const short = receipt({ merchant: 'Target', discounts: [{ description: 'Coupon', code: 'SAVE10', amount: 10 }] });
    expect(usageFrom(short, [item({ code: 'SAVE10' })])).toEqual([]);
    const long = receipt({ merchant: 'Amazon.com', discounts: [{ description: 'Promotion', code: 'GET5PICKUP', amount: 5 }] });
    expect(usageFrom(long, [item({ merchant: 'Amazon', code: 'GET5PICKUP' })])).toMatchObject([{ how: 'used', amount: 5 }]);
  });

  it('marks a store credit used when the receipt pays with it, and asks when the amount differs', () => {
    const credit = item({ id: 'c1', type: 'store_credit', title: '$10 Kohl’s Cash', merchant: "Kohl's", value_estimate: 10 });
    const paid = (amount: number) => receipt({ merchant: "Kohl's", discounts: [{ description: "Kohl's Cash", code: null, amount }] });
    expect(usageFrom(paid(10), [credit])).toMatchObject([{ id: 'c1', how: 'used', amount: 10 }]);
    expect(usageFrom(paid(4), [credit])).toMatchObject([{ id: 'c1', how: 'ask', amount: 4 }]);
  });

  it('only asks about a discount with no code, and only when one offer there could be it', () => {
    const r = receipt({ discounts: [{ description: 'Promotion', code: null, amount: 6.2 }] });
    expect(usageFrom(r, [item({})])).toMatchObject([{ how: 'ask', amount: 6.2 }]);
    expect(usageFrom(r, [item({ id: 'a' }), item({ id: 'b' })])).toEqual([]);
  });

  it('never counts membership savings or store sale prices as your offers', () => {
    const r = receipt({ discounts: [{ description: 'Uber One savings', code: null, amount: 3.49 }, { description: 'Delivery fee', code: null, amount: 2.99 }] });
    expect(usageFrom(r, [item({})])).toEqual([]);
  });

  it('ignores offers seen after the purchase or expired before it, and guesses already declined', () => {
    const r = receipt({ discounts: [{ description: 'Promotion', code: null, amount: 5 }] });
    expect(usageFrom(r, [item({ seen_on: '2026-10-25T00:00:00Z' })])).toEqual([]);
    expect(usageFrom(r, [item({ expires_at: '2026-10-10T00:00:00Z' })])).toEqual([]);
    expect(usageFrom(r, [item({ used_guess_declined_at: '2026-10-22T00:00:00Z' })])).toEqual([]);
    // Declined for an earlier receipt: a newer receipt can still ask.
    expect(usageFrom(r, [item({ used_guess_declined_at: '2026-10-05T00:00:00Z' })])).toHaveLength(1);
  });

  it('uses each item once, even if two lines look like it', () => {
    const r = receipt({ discounts: [{ description: 'Promo X', code: 'EATS25XL6', amount: 6.2 }, { description: 'Promotion', code: null, amount: 3 }] });
    expect(usageFrom(r, [item({ code: 'EATS25XL6' })])).toHaveLength(1);
  });
});
