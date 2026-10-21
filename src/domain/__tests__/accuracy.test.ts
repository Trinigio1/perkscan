import { accuracyPercent, reviewsNeeded, topMistakes } from '../accuracy';

describe('accuracy', () => {
  it('is the share of reviewed messages read right', () => {
    expect(accuracyPercent({ checked: 18, right: 16 })).toBe(89);
    expect(accuracyPercent({ checked: 0, right: 0 })).toBeNull();
  });
  it('lists the most common mistakes first', () => {
    expect(topMistakes({ fields: { code: 1, expiry: 3, amount: 3, card: 0 } })).toEqual([
      { field: 'amount', label: 'Amount', count: 3 },
      { field: 'expiry', label: 'Expiry date', count: 3 },
      { field: 'code', label: 'Code', count: 1 },
    ]);
  });
  it('asks for more reviews until the rate means something', () => {
    expect(reviewsNeeded({ checked: 3 })).toBe(7);
    expect(reviewsNeeded({ checked: 12 })).toBeNull();
  });
});
