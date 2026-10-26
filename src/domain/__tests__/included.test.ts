import { includedWhenYouNeedIt } from '../included';

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
  it('lists one-time credits and membership perks, not periodic credits or card perks', () => {
    const items = includedWhenYouNeedIt([{ id: 'uc1', card_id: 'boa_premium_rewards', last_four: '6042' }, { id: 'uc2', card_id: 'uber_one', last_four: null }], cards, benefits);
    expect(items.map((i) => [i.from, i.title, i.amount, i.kind])).toEqual([
      ['Bank of America Premium Rewards credit card ·· 6042', 'Global Entry or TSA PreCheck credit', 100, 'credit'],
      ['Uber One', '$0 delivery fee and up to 10% off', null, 'membership_perk'],
    ]);
  });
});
