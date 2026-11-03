import { opp } from '../__fixtures__/opportunities';
import {
  coversFor, expiringPointsMoves, feeDayMoves, moneyMoves, modelTokens, nextFeeDate, phoneInsuranceMoves, protectionPlanMoves, rebateMoves, recallMoves, rentalWaiverMoves, tripInsuranceMoves,
  type ItemReceipt, type ProductRecall,
} from '../moves';
import type { CardBenefit } from '../types';

const now = new Date('2026-11-10T12:00:00');
const cards = [
  { id: 'venture_x', kind: 'card' as const, issuer: 'Capital One', product_name: 'Capital One Venture X Rewards', country: 'US', currency: 'USD', annual_fee: 395 },
  { id: 'venture', kind: 'card' as const, issuer: 'Capital One', product_name: 'Capital One Venture Rewards', country: 'US', currency: 'USD', annual_fee: 95 },
  { id: 'csp', kind: 'card' as const, issuer: 'Chase', product_name: 'Chase Sapphire Preferred®', country: 'US', currency: 'USD', annual_fee: 95 },
];
const b = (id: string, card_id: string, name: string, extra: Partial<CardBenefit> = {}): CardBenefit =>
  ({ id, card_id, type: 'protection', name, amount: null, period: 'per_claim', period_anchor: 'calendar', amount_schedule: null, terms_summary: `${name} terms`, max_coverage: null, coverage_window_days: null, enrollment_required: false, merchant_match: null, currency: null, status: 'active', source_url: 'https://issuer.example.com/benefits', last_verified: '2026-10-01', notes: null, sort_order: 0, ...extra }) as CardBenefit;
const benefits = [
  b('venture_x__cell_phone', 'venture_x', 'Cell phone protection'),
  b('venture_x__rental_car', 'venture_x', 'Rental car coverage'),
  b('csp__extended_warranty', 'csp', 'Extended warranty'),
  b('csp__trip_delay', 'csp', 'Trip delay'),
  b('csp__unverified', 'csp', 'Cell phone protection', { id: 'csp__cell_phone', status: 'TODO_VERIFY' }),
  b('venture_x__travel_credit', 'venture_x', 'Travel credit', { type: 'credit', amount: 300, period: 'annual' }),
];
const userCards = [
  { id: 'u_vx', card_id: 'venture_x', last_four: '1111', open_date: '2023-12-01', nickname: null },
  { id: 'u_csp', card_id: 'csp', last_four: '2222', open_date: null, nickname: null },
];
const r = (id: string, extra: Partial<ItemReceipt>): ItemReceipt => ({ id, merchant: 'Store', total: 100, currency: 'USD', purchase_date: '2026-11-01', purchase_type: 'other_goods', matched_user_card_id: null, travel_date: null, items: [], ...extra });

describe('covers', () => {
  it('only counts protections with verified terms', () => {
    expect(coversFor(['cell_phone'], userCards, cards, benefits).map((c) => c.userCardId)).toEqual(['u_vx']);
  });
});

describe('you already have this', () => {
  const phone = coversFor(['cell_phone'], userCards, cards, benefits);
  it('finds phone insurance on the phone bill, monthly, and says to pay the bill with the covering card', () => {
    const m = phoneInsuranceMoves([r('bill', { merchant: 'Verizon', purchase_type: 'phone_bill', total: 82, items: [{ name: 'Unlimited plan', price: 65 }, { name: 'Verizon Mobile Protect', price: 17 }] })], phone, now);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ key: 'phone_insurance:verizon', amount: 17, per: 'month', confirmLabel: 'I dropped it' });
    expect(m[0]!.steps[0]).toMatch(/switch your Verizon autopay to your Capital One Venture X Rewards ·· 1111/);
    // Old bills don't count; no covering card, nothing to say.
    expect(phoneInsuranceMoves([r('old', { merchant: 'Verizon', purchase_date: '2026-06-01', items: [{ name: 'Mobile Protect', price: 17 }] })], phone, now)).toEqual([]);
    expect(phoneInsuranceMoves([r('bill', { items: [{ name: 'Mobile Protect', price: 17 }] })], [], now)).toEqual([]);
  });

  it('flags a rental coming up, with what the counter will ask', () => {
    const m = rentalWaiverMoves([r('car', { merchant: 'Hertz', purchase_type: 'car_rental', travel_date: '2026-12-03', matched_user_card_id: 'u_vx' }), r('past', { purchase_type: 'car_rental', travel_date: '2026-10-01' })], coversFor(['rental_car'], userCards, cards, benefits), now);
    expect(m.map((x) => [x.key, x.by, x.amount])).toEqual([['rental_waiver:car', '2026-12-03', null]]);
    expect(m[0]!.steps[0]).toMatch(/You booked with this card/);
  });

  it('finds a store protection plan and trip insurance you just bought', () => {
    const w = coversFor(['extended_warranty', 'purchase_protection'], userCards, cards, benefits);
    const plans = protectionPlanMoves([r('tv', { merchant: 'Best Buy', purchase_type: 'electronics', matched_user_card_id: 'u_csp', items: [{ name: '65" TV', price: 899 }, { name: 'Geek Squad Protection 3yr', price: 179.99 }] })], w, now);
    expect(plans.map((x) => [x.key, x.amount, x.confirmLabel])).toEqual([['protection_plan:tv:1', 179.99, 'I cancelled it']]);
    const trip = tripInsuranceMoves([r('trip', { merchant: 'Expedia', purchase_type: 'flight', items: [{ name: 'Flight', price: 420 }, { name: 'Trip Protection by Allianz', price: 38 }] })], coversFor(['trip_delay'], userCards, cards, benefits), now);
    expect(trip.map((x) => [x.amount, x.why.startsWith('Your Chase Sapphire Preferred ·· 2222 has Trip delay')])).toEqual([[38, true]]);
  });
});

describe('points about to expire', () => {
  it('lists points expiring within a month, soonest first, marked used on the item itself', () => {
    const m = expiringPointsMoves(
      [
        opp({ id: 'p1', type: 'points', title: '412 Stars', merchant: 'Starbucks', expires_at: '2026-12-01T00:00:00Z', value_estimate: null }),
        opp({ id: 'p2', type: 'points', title: '1,200 points', merchant: 'Sephora', expires_at: '2026-11-20T00:00:00Z', value_estimate: 10 }),
        opp({ id: 'p3', type: 'points', title: 'Later', expires_at: '2027-03-01T00:00:00Z' }),
        opp({ id: 'p4', type: 'promo', title: 'Not points', expires_at: '2026-11-15T00:00:00Z' }),
      ],
      now,
    );
    expect(m.map((x) => [x.opportunityId, x.amount])).toEqual([['p2', 10], ['p1', null]]);
    expect(m[1]!.title).toBe('412 Stars at Starbucks: use by Dec 1');
  });
});

describe('annual fee day', () => {
  it('works out the next fee date from the open date', () => {
    expect(nextFeeDate('2023-12-01', now).toISOString().slice(0, 10)).toBe('2026-12-01');
    expect(nextFeeDate('2023-03-05', now).toISOString().slice(0, 10)).toBe('2027-03-05');
    expect(nextFeeDate('2026-11-20', now).toISOString().slice(0, 10)).toBe('2027-11-20'); // opened this year
  });
  it('shows what the card gave back against its fee and a cheaper card from the same family', () => {
    const credit = opp({ id: 'c1', type: 'card_credit', user_card_id: 'u_vx' });
    const m = feeDayMoves(userCards, cards, benefits, [credit], [{ opportunity_id: 'c1', amount: 300, recovered_at: '2026-05-01T00:00:00Z' }], now);
    expect(m.map((x) => [x.key, x.amount, x.by])).toEqual([['annual_fee:u_vx:2026', 395, '2026-12-01']]);
    expect(m[0]!.why).toBe('In the last 12 months you used $300 of its credits (it offers $300 a year), against a $395 fee.');
    expect(m[0]!.steps[1]).toMatch(/switching to the Capital One Venture Rewards \(\$95 fee\)/);
  });
});

describe('recalls and rebates', () => {
  const recall: ProductRecall = { id: 'R1', recall_date: '2026-10-20', title: 'Acme Recalls Space Heaters Due to Fire Hazard', url: 'https://www.cpsc.gov/Recalls/2027/acme', products: [{ name: 'Acme Ceramic Space Heater', model: 'SH-2200, SH-2210' }], manufacturers: ['Acme Corp'], remedies: ['Refund'] };
  it('matches on a model number or the maker plus the product’s words; never on a vague name', () => {
    expect(modelTokens('SH-2200, SH-2210')).toEqual(['sh2200', 'sh2210']);
    const hits = recallMoves([recall], [
      r('a', { merchant: 'Target', items: [{ name: 'Heater SH2210 black', price: 49.99 }] }),
      r('b', { merchant: 'Walmart', items: [{ name: 'Acme ceramic space heater', price: 39 }] }),
      r('c', { merchant: 'Amazon', items: [{ name: 'Space heater', price: 30 }] }),
    ]);
    expect(hits.map((h) => [h.key, h.amount, h.confirmLabel])).toEqual([
      ['recall:R1:a', 49.99, 'Got my refund'],
      ['recall:R1:b', 39, 'Got my refund'],
    ]);
  });
  it('suggests a rebate check for a new appliance', () => {
    expect(rebateMoves([r('fridge', { purchase_type: 'appliance', merchant: 'Lowe’s' }), r('old', { purchase_type: 'appliance', purchase_date: '2026-01-01' })], now).map((x) => x.key)).toEqual(['rebate:fridge']);
  });
});

describe('moneyMoves', () => {
  it('leaves out what you already did or dismissed, soonest deadline first', () => {
    const receipts = [
      r('bill', { merchant: 'Verizon', purchase_type: 'phone_bill', items: [{ name: 'Mobile Protect', price: 17 }] }),
      r('car', { merchant: 'Hertz', purchase_type: 'car_rental', travel_date: '2026-11-20', matched_user_card_id: 'u_vx' }),
    ];
    const all = moneyMoves({ userCards, cards, benefits, opportunities: [], recovered: [], receipts, recalls: [], done: new Set() }, now);
    expect(all.map((m) => m.kind)).toEqual(['rental_waiver', 'annual_fee', 'phone_insurance']);
    const left = moneyMoves({ userCards, cards, benefits, opportunities: [], recovered: [], receipts, recalls: [], done: new Set(['phone_insurance:verizon']) }, now);
    expect(left.map((m) => m.kind)).toEqual(['rental_waiver', 'annual_fee']);
  });
});
