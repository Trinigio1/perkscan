import { annualCreditValue, computeWorthIt, historicalUseRate } from '../worthIt';

describe('annualCreditValue', () => {
  it('multiplies by periods per year', () => {
    expect(annualCreditValue({ amount: 15, period: 'monthly', amount_schedule: null })).toBe(180);
    expect(annualCreditValue({ amount: 100, period: 'quarterly', amount_schedule: null })).toBe(400);
    expect(annualCreditValue({ amount: 300, period: 'semiannual', amount_schedule: null })).toBe(600);
    expect(annualCreditValue({ amount: 300, period: 'annual', amount_schedule: null })).toBe(300);
  });
  it('applies monthly overrides', () => {
    expect(annualCreditValue({ amount: 15, period: 'monthly', amount_schedule: { '12': 35 } })).toBe(200);
  });
  it('returns null for unverified or per-claim benefits', () => {
    expect(annualCreditValue({ amount: null, period: 'monthly', amount_schedule: null })).toBeNull();
    expect(annualCreditValue({ amount: 120, period: 'per_claim', amount_schedule: null })).toBeNull();
  });
});

describe('computeWorthIt', () => {
  const credit = (annualValue: number | null, useRate = 1) => ({ benefitId: 'x', name: 'x', annualValue, useRate });

  it('says worth it when expected value clearly beats the fee', () => {
    const r = computeWorthIt(95, [credit(300, 1)]);
    expect(r.verdict).toBe('worth_it');
    expect(r.net).toBe(205);
  });
  it('says not worth it when the user would not use enough', () => {
    const r = computeWorthIt(695, [credit(600, 0.5), credit(240, 0.25)]);
    expect(r.expectedValue).toBe(360);
    expect(r.verdict).toBe('not_worth_it');
  });
  it('calls a near-even result borderline', () => {
    expect(computeWorthIt(300, [credit(310)]).verdict).toBe('borderline');
  });
  it('is unknown when the fee is not verified', () => {
    const r = computeWorthIt(null, [credit(300)]);
    expect(r.verdict).toBe('unknown');
    expect(r.net).toBeNull();
  });
  it('is unknown, not "not worth it", when no credit amounts are verified', () => {
    const r = computeWorthIt(550, [credit(null), credit(null)]);
    expect(r.verdict).toBe('unknown');
    expect(r.unverifiedCount).toBe(2);
  });
  it('treats no-fee cards as worth keeping', () => {
    expect(computeWorthIt(0, []).verdict).toBe('worth_it');
  });
  it('computes the break-even use rate', () => {
    expect(computeWorthIt(300, [credit(600)]).breakEvenRate).toBe(0.5);
    expect(computeWorthIt(900, [credit(600)]).breakEvenRate).toBeNull();
  });
  it('clamps use rates to 0..1', () => {
    expect(computeWorthIt(0, [credit(100, 3)]).expectedValue).toBe(100);
    expect(computeWorthIt(0, [credit(100, -1)]).expectedValue).toBe(0);
  });
});

describe('historicalUseRate', () => {
  it('defaults to 50% with no history', () => {
    expect(historicalUseRate(0, 0, 0)).toBe(0.5);
  });
  it('uses the share of value actually used', () => {
    expect(historicalUseRate(4, 30, 40)).toBe(0.75);
  });
});
