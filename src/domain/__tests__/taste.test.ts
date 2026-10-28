import { opp } from '../__fixtures__/opportunities';
import { interestProfile, rankDeals, type Deal } from '../deals';
import { learnTaste, tasteLine } from '../taste';

const deal = (d: Partial<Deal>): Deal => ({
  id: 'd', source: 'official', merchant: 'Target', merchant_keys: ['target'], title: 'Deal', summary: null, category: 'shopping',
  amount: 5, percent_off: null, currency: 'USD', code: 'CODE', min_spend: null, countries: ['US'], regions: [],
  starts_on: null, ends_on: '2099-01-01', url: 'https://example.com', evidence: 'x', confidence: 'confirmed', seen_by: 0, saves: 0, ...d,
});

describe('learnTaste', () => {
  const deals = [
    deal({ id: 'gym', merchant: 'Planet Fitness', merchant_keys: ['planetfitness'], category: 'fitness' }),
    deal({ id: 'gym2', merchant: 'Crunch Fitness', merchant_keys: ['crunch'], category: 'fitness' }),
    deal({ id: 'nails', merchant: 'Ulta', merchant_keys: ['ulta'], category: 'beauty' }),
  ];
  it('learns from what you save, hide, use and say you have', () => {
    const t = learnTaste({
      dealFeedback: [{ deal_id: 'gym', action: 'saved' }, { deal_id: 'nails', action: 'dismissed' }, { deal_id: 'gym2', action: 'didnt_work' }],
      deals,
      opportunities: [opp({ type: 'promo', status: 'claimed', interest: 'delivery', merchant: 'Uber Eats', title: '25% off' })],
      perkFeedback: [{ program_id: 'chipotle', action: 'have' }],
      programs: [{ id: 'chipotle', interests: ['dining'] }],
    });
    expect(t.liked).toEqual([['delivery', 2], ['fitness', 1], ['dining', 1]]);
    expect(t.disliked).toEqual([['beauty', -1]]);
    expect(tasteLine(t)).toBe('food delivery, fitness and eating out');
  });

  it('ranks deals like the ones you saved higher, and ones like those you hid lower', () => {
    const profile = interestProfile({ picked: [], receipts: [], opportunities: [], senderDomains: [] });
    const who = { country: 'US', today: '2026-10-28', profile, feedback: [] };
    const candidates = [deal({ id: 'a', merchant: 'Crunch Fitness', merchant_keys: ['crunch'], category: 'fitness' }), deal({ id: 'b', merchant: 'Sephora', merchant_keys: ['sephora'], category: 'beauty' })];
    const taste = { liked: [['fitness', 2]] as [string, number][], disliked: [['beauty', -2]] as [string, number][] };
    const { forYou, popular } = rankDeals(candidates, { ...who, taste });
    expect(forYou.map((x) => [x.deal.id, x.why])).toEqual([['a', 'Like fitness deals you saved or used']]);
    expect(popular.find((x) => x.deal.id === 'b')!.score).toBeLessThan(rankDeals(candidates, who).popular.find((x) => x.deal.id === 'b')!.score);
  });
});
