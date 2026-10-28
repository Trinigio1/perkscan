import { whereItWorks } from '../whereItWorks';

const promo = (o: Parameters<typeof whereItWorks>[0] extends infer T ? Partial<T> : never) => ({ type: 'promo' as const, merchant: 'Uber Eats', valid_at: null, first_order_only: null, ...o });

describe('whereItWorks', () => {
  it('says where a code works and if it is for a first order', () => {
    expect(whereItWorks(promo({ valid_at: 'ALDI', first_order_only: true })).line).toBe('Only at ALDI · first order only');
    expect(whereItWorks(promo({ valid_at: 'participating restaurants' })).line).toBe('Participating restaurants only');
    expect(whereItWorks(promo({ first_order_only: true })).line).toBe('First order only');
  });
  it('warns when a delivery app’s email doesn’t say where', () => {
    expect(whereItWorks(promo({})).caveat).toMatch(/doesn’t say which restaurants.*Uber Eats codes often apply only at some/);
    expect(whereItWorks(promo({ merchant: 'Instacart' })).caveat).toMatch(/which stores/);
    expect(whereItWorks(promo({ valid_at: 'ALDI' })).caveat).toBeNull();
    expect(whereItWorks(promo({ merchant: 'Target' }))).toEqual({ line: null, caveat: null });
  });
  it('is only about codes', () => {
    expect(whereItWorks({ type: 'store_credit', merchant: 'Uber Eats', valid_at: 'ALDI', first_order_only: true })).toEqual({ line: null, caveat: null });
  });
});
