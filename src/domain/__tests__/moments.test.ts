import { nextPeriodStart, planMoments, type MomentsInput } from '../moments';
import type { Program } from '../programs';

const NOW = new Date(2026, 9, 22, 12); // Thursday, October 22, 2026, noon local

const program = (p: Partial<Program> & { id: string }): Program => ({
  kind: 'free_perk', name: p.id, provider: p.id, countries: ['US'], summary: '', how_to: '', url: 'https://x.example', merchants: [],
  window_days: null, interests: [], issuers: [], student_only: false, status: 'active', last_verified: '2026-10-01', sort_order: 0, ...p,
});

const base: MomentsInput = {
  userCards: [
    { id: 'gold', card_id: 'amex_gold', last_four: '1001' },
    { id: 'prime', card_id: 'amazon_prime', last_four: null },
  ],
  cards: [
    { id: 'amex_gold', kind: 'card', product_name: 'American Express® Gold Card', currency: 'USD' },
    { id: 'amazon_prime', kind: 'membership', product_name: 'Amazon Prime', currency: 'USD' },
  ],
  benefits: [
    { id: 'g__uber', card_id: 'amex_gold', type: 'credit', name: 'Uber Cash', amount: 10, period: 'monthly', period_anchor: 'calendar', status: 'active', currency: null },
    { id: 'g__dunkin', card_id: 'amex_gold', type: 'credit', name: 'Dunkin’ credit', amount: 7, period: 'monthly', period_anchor: 'calendar', status: 'active', currency: null },
    { id: 'g__resy', card_id: 'amex_gold', type: 'credit', name: 'Resy credit', amount: 50, period: 'semiannual', period_anchor: 'calendar', status: 'active', currency: null },
    { id: 'g__unverified', card_id: 'amex_gold', type: 'credit', name: 'Mystery credit', amount: null, period: 'monthly', period_anchor: 'calendar', status: 'TODO_VERIFY', currency: null },
    { id: 'g__member_year', card_id: 'amex_gold', type: 'credit', name: 'Anniversary credit', amount: 100, period: 'annual', period_anchor: 'cardmember_year', status: 'active', currency: null },
  ],
  events: [],
  opportunities: [],
  programs: [],
  feedback: new Map(),
  shops: new Set(),
  birthMonth: null,
};

describe('nextPeriodStart', () => {
  it('is the first day of the next calendar period', () => {
    expect(nextPeriodStart('monthly', NOW)).toEqual(new Date(2026, 10, 1));
    expect(nextPeriodStart('quarterly', NOW)).toEqual(new Date(2027, 0, 1));
    expect(nextPeriodStart('semiannual', NOW)).toEqual(new Date(2027, 0, 1));
    expect(nextPeriodStart('annual', new Date(2026, 1, 3))).toEqual(new Date(2027, 0, 1));
    expect(nextPeriodStart('per_claim', NOW)).toBeNull();
  });
});

describe('planMoments', () => {
  it('says when a card’s verified credits are back, one note per card and day', () => {
    const m = planMoments(base, NOW);
    expect(m.map((x) => [x.id, x.title, x.body])).toEqual([
      ['renew-gold-2026-11-01', '$17 in American Express Gold Card credits is back', 'Uber Cash $10 · Dunkin’ credit $7. New period, ready to use.'],
      ['renew-gold-2027-01-01', 'Your American Express Gold Card credit is back', 'Resy credit $50. New period, ready to use.'],
    ]);
    expect(m[0]!.fireAt).toEqual(new Date(2026, 10, 1, 10));
  });

  it('reminds on the first day of your bank’s events and ones you asked about, not others', () => {
    const m = planMoments(
      {
        ...base,
        benefits: [],
        events: [
          { id: 'museums', title: 'Museums on Us', summary: 'Free museum entry with your Bank of America card.', starts_on: '2026-11-07', issuers: ['Bank of America'] },
          { id: 'parks', title: 'Free national park day', summary: 'Free entry on Veterans Day.', starts_on: '2026-11-11', issuers: [] },
          { id: 'fair', title: 'Book fair', summary: 'A fair.', starts_on: '2026-11-12', issuers: [] },
          { id: 'past', title: 'Already started', summary: '…', starts_on: '2026-10-01', issuers: ['Bank of America'] },
        ],
        opportunities: [{ status: 'open', title: 'Free national park day', dedupe_key: 'manual:abc' }],
      },
      NOW,
    );
    expect(m.map((x) => [x.title, x.route])).toEqual([
      ['Today: Museums on Us', '/coming-up'],
      ['Today: Free national park day', '/coming-up'],
    ]);
    expect(m[0]!.fireAt).toEqual(new Date(2026, 10, 7, 9));
  });

  it('opens your birthday month with the free birthday rewards at stores you use', () => {
    const programs = [
      program({ id: 'chipotle_rewards', provider: 'Chipotle', merchants: ['chipotle'], summary: 'Free to join. A free birthday reward.' }),
      program({ id: 'sephora', provider: 'Sephora', merchants: ['sephora'], summary: 'A birthday gift every year.' }),
      program({ id: 'panera', provider: 'Panera', merchants: ['panera'], summary: 'A free birthday treat.' }),
      program({ id: 'starbucks', provider: 'Starbucks', merchants: ['starbucks'], summary: 'A free birthday drink.' }),
      program({ id: 'cvs', provider: 'CVS', merchants: ['cvs'], summary: '2% back in ExtraBucks.' }),
    ];
    const m = planMoments(
      { ...base, benefits: [], programs, shops: new Set(['chipotlemexicangrill', 'cvs', 'starbucks']), feedback: new Map([['sephora', 'have'], ['starbucks', 'dismissed']]), birthMonth: 3 },
      NOW,
    );
    expect(m).toEqual([
      {
        id: 'birthday-2027',
        opportunityId: null,
        route: '/deals',
        fireAt: new Date(2027, 2, 1, 10),
        title: 'It’s your birthday month',
        body: 'Free birthday rewards at Chipotle, Sephora. Most need you to be a member first.',
      },
    ]);
    // Nothing to name: no note.
    expect(planMoments({ ...base, benefits: [], programs, birthMonth: 3 }, NOW)).toEqual([]);
  });

  it('a birthday later this year fires this year', () => {
    const programs = [program({ id: 'p', provider: 'Panera', merchants: ['panera'], summary: 'Birthday treat.' })];
    const m = planMoments({ ...base, benefits: [], programs, shops: new Set(['panera']), birthMonth: 12 }, NOW);
    expect(m[0]!.fireAt).toEqual(new Date(2026, 11, 1, 10));
  });
});
