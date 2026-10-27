import { includedWhenYouNeedIt, includedWorth } from '../included';

describe('includedWhenYouNeedIt', () => {
  const cards = [
    { id: 'boa_premium_rewards', kind: 'card' as const, product_name: 'Bank of America® Premium Rewards® credit card', currency: 'USD' },
    { id: 'uber_one', kind: 'membership' as const, product_name: 'Uber One', currency: 'USD' },
  ];
  const benefits = [
    { id: 'boa_premium_rewards__airline_incidental', card_id: 'boa_premium_rewards', type: 'credit' as const, name: 'Airline incidental credit', amount: 100, period: 'annual' as const, status: 'active' as const, terms_summary: null, currency: null },
    { id: 'boa_premium_rewards__global_entry', card_id: 'boa_premium_rewards', type: 'credit' as const, name: 'Global Entry or TSA PreCheck credit', amount: 100, period: 'per_claim' as const, status: 'active' as const, terms_summary: 'Every 4 years.', currency: null },
    { id: 'boa_premium_rewards__lounges', card_id: 'boa_premium_rewards', type: 'perk' as const, name: 'Lounges', amount: null, period: 'per_claim' as const, status: 'active' as const, terms_summary: null, currency: null },
    { id: 'uber_one__delivery', card_id: 'uber_one', type: 'perk' as const, name: '$0 delivery fee and up to 10% off', amount: null, period: 'per_claim' as const, status: 'active' as const, terms_summary: 'Eligible orders.', currency: null },
  ];
  const mine = [{ id: 'uc1', card_id: 'boa_premium_rewards', last_four: '6042' }, { id: 'uc2', card_id: 'uber_one', last_four: null }];
  it('lists one-time credits, membership perks and card access perks, not periodic credits', () => {
    const items = includedWhenYouNeedIt(mine, cards, benefits);
    expect(items.map((i) => [i.from, i.title, i.amount, i.kind])).toEqual([
      ['Bank of America Premium Rewards credit card ·· 6042', 'Global Entry or TSA PreCheck credit', 100, 'credit'],
      ['Bank of America Premium Rewards credit card ·· 6042', 'Lounges', null, 'card_perk'],
      ['Uber One', '$0 delivery fee and up to 10% off', null, 'membership_perk'],
    ]);
  });

  it('shows a perk’s worth by the provider’s own figure, and adds up credits and yearly worths only', () => {
    const withWorth = [
      ...benefits,
      { id: 'uber_one__grubhub', card_id: 'uber_one', type: 'perk' as const, name: 'Grubhub+ included', amount: null, period: 'per_claim' as const, status: 'active' as const, terms_summary: null, currency: null, worth: 120, worth_period: 'year' as const, worth_basis: 'A $120 value a year' },
      { id: 'boa_premium_rewards__bag', card_id: 'boa_premium_rewards', type: 'perk' as const, name: 'Free first checked bag', amount: null, period: 'per_claim' as const, status: 'active' as const, terms_summary: null, currency: null, worth: 35, worth_period: 'use' as const, worth_basis: 'The bag fee' },
    ];
    const items = includedWhenYouNeedIt(mine, cards, withWorth);
    expect(items[0]).toMatchObject({ title: 'Grubhub+ included', worth: 120, worthPeriod: 'year', worthBasis: 'A $120 value a year', currency: 'USD' });
    // Global Entry up to $100 + Grubhub+ $120 a year; the per-flight bag fee isn't added up.
    expect(includedWorth(items)).toEqual({ total: { USD: 220 }, count: 2 });
  });
});
