import { perksWorth, spentAbroad, tripsInLastYear, usageThisYear, usesThisYear } from '../perkValue';

const now = new Date('2026-11-01T12:00:00Z');
const flight = (merchant: string, date: string, order: string | null = null) => ({ merchant, purchase_type: 'flight', purchase_date: date, order_number: order });

describe('tripsInLastYear', () => {
  it('counts flight bookings from the last 12 months, once each, by airline', () => {
    const t = tripsInLastYear(
      [
        flight('Delta Air Lines', '2026-10-01', 'ABC123'),
        flight('Delta Air Lines', '2026-10-01', 'ABC123'), // the same booking seen twice
        flight('United Airlines', '2026-03-10'),
        flight('Caribbean Airlines', '2026-06-02'),
        flight('Delta Air Lines', '2025-09-01'), // more than a year ago
        { merchant: 'Delta Air Lines', purchase_type: 'other', purchase_date: '2026-10-02', order_number: null }, // not a flight
      ],
      now,
    );
    expect(t).toEqual({ flights: 3, byAirline: { delta: 1, united: 1 } });
  });
});

describe('usesThisYear', () => {
  const trips = { flights: 4, byAirline: { delta: 2 } };
  it('a lounge visit per flight; a free bag only on the card’s own airline', () => {
    expect(usesThisYear({ benefitId: 'chase_sapphire_reserve__lounges', from: 'Chase Sapphire Reserve' }, trips)).toBe(4);
    expect(usesThisYear({ benefitId: 'amex_delta_gold__checked_bag', from: 'Delta SkyMiles Gold American Express Card' }, trips)).toBe(2);
    expect(usesThisYear({ benefitId: 'chase_united_explorer__checked_bag', from: 'United Explorer Card' }, trips)).toBe(0);
    expect(usesThisYear({ benefitId: 'amex_gold__hertz_status', from: 'American Express Gold Card' }, trips)).toBe(0);
  });
});

describe('perksWorth', () => {
  const cards = [
    { id: 'csr', kind: 'card' as const, product_name: 'Chase Sapphire Reserve®', currency: 'USD', annual_fee: 795 },
    { id: 'scotia_black', kind: 'card' as const, product_name: 'Scotiabank AERO Mastercard Black', currency: 'TTD', annual_fee: null },
    { id: 'delta_gold', kind: 'card' as const, product_name: 'Delta SkyMiles® Gold American Express Card', currency: 'USD', annual_fee: 150 },
  ];
  const base = { amount_schedule: null, terms_summary: null, currency: null, worth: null, worth_period: null, worth_basis: null };
  const benefits = [
    { ...base, id: 'csr__travel_credit', card_id: 'csr', type: 'credit' as const, name: 'Travel credit', amount: 300, period: 'annual' as const, status: 'active' as const },
    { ...base, id: 'csr__doordash', card_id: 'csr', type: 'credit' as const, name: 'DoorDash promos', amount: 25, period: 'monthly' as const, status: 'active' as const },
    { ...base, id: 'csr__unverified', card_id: 'csr', type: 'credit' as const, name: 'Unverified credit', amount: null, period: 'annual' as const, status: 'TODO_VERIFY' as const },
    { ...base, id: 'csr__global_entry', card_id: 'csr', type: 'credit' as const, name: 'Global Entry', amount: 120, period: 'per_claim' as const, status: 'active' as const },
    { ...base, id: 'csr__lounges', card_id: 'csr', type: 'perk' as const, name: 'Airport lounge access', amount: null, period: 'per_claim' as const, status: 'active' as const, worth: 35, worth_period: 'use' as const, worth_basis: 'What Priority Pass charges a visit.' },
    { ...base, id: 'csr__trip_delay', card_id: 'csr', type: 'protection' as const, name: 'Trip delay', amount: null, period: 'per_claim' as const, status: 'active' as const },
    { ...base, id: 'scotia_black__lounges', card_id: 'scotia_black', type: 'perk' as const, name: 'Airport lounge access (Priority Pass)', amount: null, period: 'per_claim' as const, status: 'active' as const, currency: 'USD', worth: 350, worth_period: 'year' as const, worth_basis: '10 visits × US$35.' },
    { ...base, id: 'delta_gold__checked_bag', card_id: 'delta_gold', type: 'perk' as const, name: 'Free checked bag', amount: null, period: 'per_claim' as const, status: 'active' as const, worth: 45, worth_period: 'use' as const, worth_basis: 'Delta’s first bag fee.' },
  ];
  const mine = [
    { id: 'u1', card_id: 'csr', last_four: '4242' },
    { id: 'u2', card_id: 'scotia_black', last_four: '1111' },
    { id: 'u3', card_id: 'delta_gold', last_four: '2222' },
  ];

  it('values credits at the issuer’s amounts and perks from prices × your own trips', () => {
    const w = perksWorth(mine, cards, benefits, [flight('United Airlines', '2026-05-01'), flight('Caribbean Airlines', '2026-08-01')], now);
    // Biggest first; the Scotiabank lounge is valued in US$ on a TT$ card, as Priority Pass prices it.
    expect(w.lines.map((l) => [l.title, l.value, l.currency, l.stated])).toEqual([
      ['Airport lounge access (Priority Pass)', 350, 'USD', false],
      ['Travel credit', 300, 'USD', true],
      ['DoorDash promos', 300, 'USD', true],
      ['Global Entry', 120, 'USD', true],
      ['Airport lounge access', 70, 'USD', false],
    ]);
    expect(w.lines.find((l) => l.title === 'Airport lounge access')!.how).toBe('2 flights this past year × $35. What Priority Pass charges a visit.');
    expect(w.credits).toEqual({ USD: 720 });
    expect(w.perks).toEqual({ USD: 420 });
    expect(w.total).toEqual({ USD: 1140 });
    expect(w.fees).toEqual({ USD: 945 });
    // No Delta flights this past year: the bag is shown per use, not added.
    expect(w.perUse.map((p) => [p.title, p.worth])).toEqual([['Free checked bag', 45]]);
  });

  it('adds nothing for a per-use perk you haven’t used, and never counts unverified credits or protections', () => {
    const w = perksWorth([mine[0]!], cards, benefits, [], now);
    expect(w.total).toEqual({ USD: 720 });
    expect(w.perUse.map((p) => p.title)).toEqual(['Airport lounge access']);
    expect(w.lines.some((l) => /Unverified|Trip delay/.test(l.title))).toBe(false);
  });
});

describe('no foreign transaction fees', () => {
  const cards = [{ id: 'venture', kind: 'card' as const, product_name: 'Capital One Venture', currency: 'USD', annual_fee: 95 }];
  const mine = [{ id: 'v1', card_id: 'venture', last_four: '1111' }];
  const benefits = [
    { id: 'venture__no_foreign_fees', card_id: 'venture', type: 'perk' as const, name: 'No foreign transaction fees', amount: null, amount_schedule: null, period: 'per_claim' as const, status: 'active' as const, terms_summary: null, currency: 'USD', worth: 3, worth_period: 'percent' as const, worth_basis: 'The 3% fee many cards charge.' },
  ];
  const buy = (total: number, currency: string, date: string, card: string | null = 'v1') => ({ matched_user_card_id: card, total, currency, purchase_date: date });

  it('adds up purchases in other currencies on each card, this past year only', () => {
    const abroad = spentAbroad(
      [buy(200, 'EUR', '2026-07-01'), buy(50, 'EUR', '2026-07-02'), buy(1000, 'TTD', '2026-03-01'), buy(80, 'USD', '2026-07-03'), buy(90, 'EUR', '2025-06-01'), buy(70, 'EUR', '2026-07-04', null)],
      mine,
      cards,
      now,
    );
    expect(abroad.get('v1')).toEqual({ EUR: 250, TTD: 1000 });
    expect(usageThisYear({ benefitId: 'venture__no_foreign_fees', from: 'Capital One Venture', userCardId: 'v1', worthPeriod: 'percent' }, { flights: 0, byAirline: {} }, abroad)).toEqual({ spentAbroad: { EUR: 250, TTD: 1000 } });
  });

  it('values the perk at 3% of what you spent abroad, in that currency; nothing spent, nothing added', () => {
    const w = perksWorth(mine, cards, benefits, [], now, [buy(250, 'EUR', '2026-07-01')]);
    expect(w.lines.map((l) => [l.value, l.currency, l.how])).toEqual([[7.5, 'EUR', '3% of the €250 you spent abroad this past year. The 3% fee many cards charge.']]);
    const none = perksWorth(mine, cards, benefits, [], now, []);
    expect(none.total).toEqual({});
    expect(none.perUse).toMatchObject([{ title: 'No foreign transaction fees', per: 'percent', worth: 3 }]);
  });
});
