import { activationBucket, countLabel, foundMoney, nextStep, toCheckCount, worthCelebrating } from '../firstRun';
import { opp, rec } from '../__fixtures__/opportunities';

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
  it('counts one per store, the way Money lists them', () => {
    const vague = (merchant: string) => opp({ type: 'promo', category: 'promos', user_card_id: null, benefit_id: null, value_estimate: null, merchant, expires_at: days(9) });
    expect(toCheckCount([vague('Uber Eats'), vague('Uber Eats'), vague('Uber Eats'), vague('Fogo de Chao')], NOW)).toBe(2);
  });
});

describe('foundMoney', () => {
  it('adds up open money it can stand behind, by kind, biggest first', () => {
    const f = foundMoney(
      [
        opp({ type: 'card_credit', value_estimate: 15, user_card_id: 'uc1', expires_at: days(9) }),
        opp({ type: 'card_credit', value_estimate: 300, user_card_id: 'uc2', expires_at: days(60) }),
        opp({ type: 'promo', category: 'promos', value_estimate: 20, source_message_id: 'm1', user_card_id: null, benefit_id: null, expires_at: days(5) }),
        opp({ type: 'gift_card', category: 'store_credit_gift_cards', value_estimate: 50, source_message_id: 'm2', user_card_id: null, benefit_id: null }),
      ],
      [],
      NOW,
    );
    expect(f.total).toEqual({ USD: 385 });
    expect(f.groups.map((g) => g.kind)).toEqual(['credits', 'gift_cards', 'codes']);
    expect(f.groups[0]!.items.map((o) => o.value_estimate)).toEqual([300, 15]);
    expect(f).toMatchObject({ itemCount: 4, cards: 2, emails: 2, toCheck: 0 });
  });

  it('lists guesses and unknown amounts without counting them', () => {
    const f = foundMoney(
      [
        opp({ type: 'card_credit', value_estimate: null }),
        opp({ type: 'refund', category: 'refunds', value_estimate: 40, dedupe_key: 'double_charge:x', user_card_id: null, benefit_id: null }),
        opp({ type: 'promo', category: 'promos', value_estimate: null, code: 'SAVE20', user_card_id: null, benefit_id: null }),
      ],
      [],
      NOW,
    );
    expect(f.total).toEqual({});
    expect(f.itemCount).toBe(3);
    expect(f.toCheck).toBe(2);
    expect(worthCelebrating(f)).toBe(true);
  });

  it('takes off what was already used, keeps currencies apart, and notes what was missed', () => {
    const a = opp({ type: 'card_credit', value_estimate: 100 });
    const f = foundMoney(
      [
        a,
        opp({ type: 'card_credit', value_estimate: 50, currency: 'TTD' }),
        opp({ type: 'card_credit', value_estimate: 10, expires_at: days(-3) }),
        opp({ type: 'card_credit', value_estimate: 10, status: 'claimed' }),
        opp({ type: 'protection', category: 'card_protections', value_estimate: null, benefit_id: 'p' }),
      ],
      [rec(a.id, 30)],
      NOW,
    );
    expect(f.total).toEqual({ USD: 70, TTD: 50 });
    expect(f.missed).toEqual({ USD: 10 });
    expect(f.protectedCount).toBe(1);
    expect(f.itemCount).toBe(2);
  });

  it('is not worth a moment with nothing in it', () => {
    expect(worthCelebrating(foundMoney([], [], NOW))).toBe(false);
  });
});

describe('activationBucket', () => {
  it('buckets the time since setup', () => {
    const ago = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
    expect(activationBucket(ago(2), NOW)).toBe('under_5m');
    expect(activationBucket(ago(12), NOW)).toBe('under_30m');
    expect(activationBucket(ago(600), NOW)).toBe('same_day');
    expect(activationBucket(ago(3000), NOW)).toBe('later');
    expect(activationBucket(null, NOW)).toBe('unknown');
  });
});

describe('countLabel', () => {
  it('reads naturally for one or many', () => {
    expect(countLabel('gift_cards', 1)).toBe('1 gift card');
    expect(countLabel('codes', 2)).toBe('2 codes');
    expect(countLabel('credits', 4)).toBe('4 card credits');
    expect(countLabel('points', 1)).toBe('1 points balance');
  });
});
