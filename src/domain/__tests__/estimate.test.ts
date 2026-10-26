import { opp } from '../__fixtures__/opportunities';
import { dealsWorth, discountSummary, estimateDiscount, offerEstimate, percentOff, usualSpend } from '../estimate';
import type { Deal, RankedDeal } from '../deals';
import type { Receipt } from '../types';

const NOW = new Date('2026-10-20T12:00:00Z');
const receipt = (r: Partial<Receipt>): Receipt => ({
  id: 'r', merchant: 'Store', total: 10, currency: 'USD', purchase_date: '2026-09-01', last_four: null, purchase_type: null,
  matched_user_card_id: null, kind: 'receipt', pending: false, ...r,
});
const receipts = [
  receipt({ merchant: 'NIKE.COM', total: 60 }),
  receipt({ merchant: 'Nike', total: 80 }),
  receipt({ merchant: 'Nike Store #12', total: 400 }),
  receipt({ merchant: 'Nike', total: 90, purchase_date: '2025-01-01' }), // over a year ago
  receipt({ merchant: 'Sephora', total: 45 }),
  receipt({ merchant: 'Courts', total: 1500, currency: 'TTD' }),
];

describe('percentOff', () => {
  it('reads a plain percent off, nothing else', () => {
    expect(percentOff('20% off sitewide')).toBe(20);
    expect(percentOff('Extra 15 % OFF')).toBe(15);
    expect(percentOff('Up to 99% off')).toBeNull();
    expect(percentOff('5% back in points')).toBeNull();
    expect(percentOff(null)).toBeNull();
  });
});

describe('usualSpend', () => {
  it('is the middle of your orders there in the last year, however the store is written', () => {
    expect(usualSpend('Nike', receipts, NOW)).toEqual({ amount: 80, currency: 'USD', orders: 3 });
    expect(usualSpend('Courts', receipts, NOW)).toEqual({ amount: 1500, currency: 'TTD', orders: 1 });
    expect(usualSpend('Adidas', receipts, NOW)).toBeNull();
    expect(usualSpend('Nike', receipts, NOW, 'TTD')).toBeNull();
  });
});

describe('estimateDiscount', () => {
  it('is the percent of what you usually spend there', () => {
    expect(estimateDiscount(20, 'Nike', null, receipts, NOW)).toMatchObject({ value: 16, currency: 'USD', percent: 20, basis: { amount: 80, orders: 3 } });
  });

  it('needs your receipts there, and a minimum spend you’d reach anyway', () => {
    expect(estimateDiscount(20, 'Adidas', null, receipts, NOW)).toBeNull();
    expect(estimateDiscount(20, 'Nike', 100, receipts, NOW)).toBeNull();
    expect(estimateDiscount(20, 'Nike', 50, receipts, NOW)?.value).toBe(16);
    expect(estimateDiscount(null, 'Nike', null, receipts, NOW)).toBeNull();
  });
});

describe('email offers', () => {
  const promo = (o: Parameters<typeof opp>[0]) => opp({ type: 'promo', category: 'promos', value_estimate: null, user_card_id: null, benefit_id: null, ...o });

  it('estimates open percent-off codes, from the stored percent or the title', () => {
    expect(offerEstimate(promo({ merchant: 'Nike', percent_off: 25 }), receipts, NOW)?.value).toBe(20);
    expect(offerEstimate(promo({ merchant: 'Sephora', title: '20% off with code GLOW' }), receipts, NOW)?.value).toBe(9);
    expect(offerEstimate(promo({ merchant: 'Nike', percent_off: 25, value_estimate: 10 }), receipts, NOW)).toBeNull(); // already money
    expect(offerEstimate(promo({ merchant: 'Nike', percent_off: 25, expires_at: '2026-10-01T00:00:00Z' }), receipts, NOW)).toBeNull();
  });

  it('sums estimates per currency and counts the rest, never touching stated money', () => {
    const s = discountSummary(
      [
        promo({ merchant: 'Nike', percent_off: 25 }),
        promo({ merchant: 'Sephora', title: '20% off with code GLOW' }),
        promo({ merchant: 'Adidas', title: '40% off everything' }),
        promo({ merchant: 'Starbucks', title: 'Free birthday drink' }),
        promo({ merchant: 'Target', title: '$10 off', value_estimate: 10 }),
        opp({ type: 'gift_card', value_estimate: null }),
      ],
      receipts,
      NOW,
    );
    expect(s).toEqual({ estimated: { USD: 29 }, estimatedCount: 2, otherCount: 2, bestPercent: 40 });
  });
});

describe('dealsWorth', () => {
  const deal = (d: Partial<Deal>): RankedDeal => ({
    deal: {
      id: 'd', source: 'official', merchant: 'Store', merchant_keys: [], title: 't', summary: null, category: 'shopping', amount: null, percent_off: null,
      currency: 'USD', code: null, min_spend: null, countries: ['US'], regions: [], starts_on: null, ends_on: null, url: null, evidence: null,
      confidence: 'confirmed', seen_by: 0, saves: 0, ...d,
    },
    tags: [],
    score: 1,
    why: null,
  });

  it('adds stated amounts and percent estimates at stores you use; counts the rest without a value', () => {
    const w = dealsWorth(
      [
        deal({ merchant: 'Best Buy', amount: 50 }),
        deal({ merchant: 'Nike', percent_off: 30 }),
        deal({ merchant: 'Adidas', percent_off: 30 }), // you don't shop there: no estimate
        deal({ merchant: 'Nike', amount: 40, min_spend: 200 }), // you'd have to spend more than usual
        deal({ merchant: 'Courts', amount: 300, currency: 'TTD' }),
      ],
      receipts,
      NOW,
      'USD',
    );
    expect(w).toEqual({ worth: { USD: 74, TTD: 300 }, counted: 3, total: 5 });
  });
});

describe('amount off with a minimum spend', () => {
  const promo = (o: Parameters<typeof opp>[0]) => opp({ type: 'promo', category: 'promos', value_estimate: null, user_card_id: null, benefit_id: null, ...o });
  it('counts only when you usually spend the minimum there', () => {
    expect(offerEstimate(promo({ merchant: 'Nike', discount_amount: 15, min_spend: 75 }), receipts, NOW)).toMatchObject({ value: 15, percent: null });
    expect(offerEstimate(promo({ merchant: 'Nike', discount_amount: 15, min_spend: 150 }), receipts, NOW)).toBeNull();
    expect(offerEstimate(promo({ merchant: 'Pura Vida', discount_amount: 15, min_spend: 75 }), receipts, NOW)).toBeNull();
  });
});
