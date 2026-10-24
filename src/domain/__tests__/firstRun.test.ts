import { foundSummary, nextStep, toCheckCount } from '../firstRun';
import { opp } from '../__fixtures__/opportunities';

const NOW = new Date('2026-10-22T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe('nextStep', () => {
  it('is the first step not done yet, or nothing', () => {
    const cards = { id: 'cards' as const, title: 'Add your cards', done: true, route: '/add-card' as const };
    const inbox = { id: 'inbox' as const, title: 'Connect your email or texts', done: false, route: '/connect-gmail' as const };
    expect(nextStep([cards, inbox])?.id).toBe('inbox');
    expect(nextStep([cards, { ...inbox, done: true }])).toBeNull();
  });
});

describe('toCheckCount', () => {
  it('counts open items still to confirm, never protections or used ones', () => {
    const list = [
      opp({ type: 'card_credit', value_estimate: null, expires_at: days(9) }),
      opp({ type: 'card_credit', value_estimate: null, expires_at: days(30) }),
      opp({ type: 'card_credit', value_estimate: 10, expires_at: days(9) }),
      opp({ type: 'card_credit', value_estimate: null, status: 'claimed', expires_at: days(-2) }),
      opp({ type: 'protection', value_estimate: null, expires_at: days(60), benefit_id: 'x' }),
    ];
    expect(toCheckCount(list, NOW)).toBe(2);
  });
});

describe('foundSummary', () => {
  it('sums up what came from email, biggest first', () => {
    const s = foundSummary([
      opp({ type: 'promo', source_message_id: 'm1' }),
      opp({ type: 'promo', source_message_id: 'm2' }),
      opp({ type: 'gift_card', source_message_id: 'm3' }),
      opp({ type: 'card_credit', source_message_id: null }),
    ]);
    expect(s.total).toBe(3);
    expect(s.parts.map((p) => p.label)).toEqual(['2 codes', '1 gift card']);
  });
});
