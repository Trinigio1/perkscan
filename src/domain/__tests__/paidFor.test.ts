import { opp, rec } from '../__fixtures__/opportunities';
import { allSetup, needsSetup, paidFor, paidForTotals, type ReceiptWithDiscounts } from '../paidFor';
import type { CardBenefit } from '../types';

const NOW = new Date(2026, 9, 22, 12); // October 22, 2026

const benefit = (p: Partial<CardBenefit> & { id: string; card_id: string }): CardBenefit => ({
  type: 'perk',
  name: p.id,
  amount: null,
  period: 'per_claim',
  period_anchor: 'calendar',
  amount_schedule: null,
  terms_summary: null,
  max_coverage: null,
  coverage_window_days: null,
  enrollment_required: false,
  merchant_match: null,
  currency: null,
  status: 'active',
  source_url: 'https://example.com/terms',
  last_verified: null,
  notes: null,
  sort_order: 0,
  ...p,
});

const cards = [
  { id: 'amex_gold', kind: 'card' as const, product_name: 'American Express® Gold Card', annual_fee: 325, currency: 'USD' },
  { id: 'uber_one', kind: 'membership' as const, product_name: 'Uber One', annual_fee: 96, currency: 'USD' },
  { id: 'amazon_prime', kind: 'membership' as const, product_name: 'Amazon Prime', annual_fee: 139, currency: 'USD' },
  { id: 'chase_freedom_unlimited', kind: 'card' as const, product_name: 'Chase Freedom Unlimited®', annual_fee: 0, currency: 'USD' },
];
const benefits = [
  benefit({ id: 'amex_gold__uber_cash', card_id: 'amex_gold', type: 'credit', amount: 10, period: 'monthly', enrollment_required: true, terms_summary: 'Add the Gold Card to your Uber account.' }),
  benefit({ id: 'amex_gold__resy', card_id: 'amex_gold', type: 'credit', amount: 50, period: 'semiannual', enrollment_required: true, terms_summary: 'Enroll first.' }),
  benefit({ id: 'amex_gold__purchase_protection', card_id: 'amex_gold', type: 'protection', enrollment_required: false }),
  benefit({ id: 'amazon_prime__grubhub_plus', card_id: 'amazon_prime', terms_summary: 'Free Grubhub+. Link it in your Grubhub account.' }),
  benefit({ id: 'amazon_prime__prime_video', card_id: 'amazon_prime', terms_summary: 'Prime Video is included with Prime.' }),
  benefit({ id: 'chase_freedom_unlimited__dashpass', card_id: 'chase_freedom_unlimited', terms_summary: 'Activate by December 31 and pay with the card.' }),
];
const userCards = [
  { id: 'gold', card_id: 'amex_gold', last_four: '1001' },
  { id: 'uber', card_id: 'uber_one', last_four: null },
  { id: 'prime', card_id: 'amazon_prime', last_four: null },
  { id: 'cfu', card_id: 'chase_freedom_unlimited', last_four: '2002' },
];
const receipt = (p: Partial<ReceiptWithDiscounts>): ReceiptWithDiscounts => ({ id: 'r', merchant: 'Uber Eats', total: 30, currency: 'USD', purchase_date: '2026-10-01', purchase_type: 'food', discounts: [], ...p });

describe('needsSetup', () => {
  it('is flagged in the catalog or said in the terms; protections never', () => {
    expect(needsSetup(benefits[0]!)).toBe(true);
    expect(needsSetup(benefits[3]!)).toBe(true); // "Link it in your Grubhub account"
    expect(needsSetup(benefits[4]!)).toBe(false); // Prime Video just works
    expect(needsSetup(benefits[2]!)).toBe(false);
    expect(needsSetup({ ...benefits[0]!, status: 'TODO_VERIFY' })).toBe(false);
  });
});

describe('paidFor', () => {
  const uberMonthUsed = opp({ id: 'uc-sep', user_card_id: 'gold', benefit_id: 'amex_gold__uber_cash', status: 'claimed', value_estimate: 10 });
  const uberOct = opp({ id: 'uc-oct', user_card_id: 'gold', benefit_id: 'amex_gold__uber_cash', status: 'open', value_estimate: 10, expires_at: '2026-10-31T23:59:59Z' });
  const resyH2 = opp({ id: 'resy-h2', user_card_id: 'gold', benefit_id: 'amex_gold__resy', status: 'open', value_estimate: 50, expires_at: '2026-12-31T23:59:59Z' });
  const base = {
    userCards,
    cards,
    benefits,
    opportunities: [uberMonthUsed, uberOct, resyH2],
    recovered: [rec('uc-sep', 10, '2026-09-15T00:00:00Z'), rec('uc-sep', 15, '2025-06-01T00:00:00Z'), rec('resy-h2', 20, '2026-08-01T00:00:00Z')],
    receipts: [
      receipt({ id: 'r1', discounts: [{ description: 'Uber One savings', code: null, amount: 3.49 }, { description: 'Promo', code: 'EATS25', amount: 6 }] }),
      receipt({ id: 'r2', discounts: [{ description: 'Uber One membership benefit', code: null, amount: 2.5 }] }),
      receipt({ id: 'r3', purchase_date: '2025-12-01', discounts: [{ description: 'Uber One savings', code: null, amount: 9 }] }),
      receipt({ id: 'r4', merchant: 'Whole Foods Market', discounts: [{ description: 'Prime member deal', code: null, amount: 4 }] }),
    ],
    setup: [],
  };

  it('sets a card fee against the credits used this year and what is left', () => {
    const gold = paidFor(base, NOW).find((p) => p.userCardId === 'gold')!;
    expect(gold.fee).toBe(325);
    expect(gold.name).toBe('American Express Gold Card ·· 1001');
    // This year's $10 Uber Cash and $20 of Resy; last year's $15 doesn't count.
    expect(gold.creditsUsed).toBe(30);
    // Open now: $10 Uber Cash for October, $30 left of Resy's second half; then November and December's Uber Cash.
    expect(gold.creditsLeft).toBe(10 + 30 + 20);
    // Both credits have been used this year, so they're clearly turned on.
    expect(gold.setup.map((s) => s.benefitId)).toEqual([]);
  });

  it('counts member savings printed on receipts this year, and only those lines', () => {
    const uber = paidFor(base, NOW).find((p) => p.userCardId === 'uber')!;
    expect(uber).toMatchObject({ fee: 96, feeFrom: 'catalog', memberSavings: 5.99, savingsReceipts: 2, gotBack: 5.99, creditsLeft: 0 });
    const prime = paidFor(base, NOW).find((p) => p.userCardId === 'prime')!;
    expect(prime.memberSavings).toBe(4);
  });

  it('uses what receipts show you pay for a membership over the catalog price', () => {
    const charges = ['2026-07-03', '2026-08-03', '2026-09-03', '2026-10-03'].map((d, i) => receipt({ id: `c${i}`, merchant: 'Uber One', total: 9.99, purchase_date: d, purchase_type: 'subscription' }));
    const uber = paidFor({ ...base, receipts: [...base.receipts, ...charges] }, NOW).find((p) => p.userCardId === 'uber')!;
    expect(uber.feeFrom).toBe('receipts');
    expect(uber.fee).toBeCloseTo(119.88, 2);
  });

  it('lists perks to turn on until answered, including on no-fee cards', () => {
    const list = paidFor(base, NOW);
    expect(allSetup(list).map((s) => s.benefitId)).toEqual(['amazon_prime__grubhub_plus', 'chase_freedom_unlimited__dashpass']);
    const cfu = list.find((p) => p.userCardId === 'cfu')!;
    expect(cfu.fee).toBe(0);
    const answered = paidFor({ ...base, setup: [{ user_card_id: 'prime', benefit_id: 'amazon_prime__grubhub_plus', status: 'done' }] }, NOW);
    expect(allSetup(answered).map((s) => s.benefitId)).toEqual(['chase_freedom_unlimited__dashpass']);
  });

  it('asks about an enrolled credit nobody has used yet', () => {
    const fresh = paidFor({ ...base, opportunities: [], recovered: [] }, NOW);
    expect(allSetup(fresh).filter((s) => s.userCardId === 'gold').map((s) => s.benefitId)).toEqual(['amex_gold__uber_cash', 'amex_gold__resy']);
  });

  it('orders by fee and totals per currency, leaving out no-fee cards', () => {
    const list = paidFor(base, NOW);
    expect(list.map((p) => p.userCardId)).toEqual(['gold', 'prime', 'uber', 'cfu']);
    expect(paidForTotals(list)).toEqual({ fees: { USD: 560 }, gotBack: { USD: 39.99 } });
  });
});
