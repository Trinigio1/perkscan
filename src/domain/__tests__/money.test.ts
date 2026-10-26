import { kindOf, moneyList, setupSteps, nextToUse, viewOf } from '../money';
import { opp } from '../__fixtures__/opportunities';

const NOW = new Date('2026-10-22T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe('viewOf', () => {
  it('sorts items into open, used and missed', () => {
    expect(viewOf(opp({ status: 'open', expires_at: days(3) }), NOW)).toBe('open');
    expect(viewOf(opp({ status: 'open', expires_at: null }), NOW)).toBe('open');
    expect(viewOf(opp({ status: 'claimed', expires_at: days(-3) }), NOW)).toBe('used');
    expect(viewOf(opp({ status: 'expired', expires_at: days(-3) }), NOW)).toBe('missed');
    // Past its date but the hourly sync hasn't caught up: still missed.
    expect(viewOf(opp({ status: 'open', expires_at: days(-1) }), NOW)).toBe('missed');
  });

  it('hides dismissed items and misses from earlier years', () => {
    expect(viewOf(opp({ status: 'dismissed', expires_at: days(3) }), NOW)).toBeNull();
    expect(viewOf(opp({ status: 'expired', expires_at: '2025-12-01T00:00:00Z' }), NOW)).toBeNull();
  });
});

describe('kindOf', () => {
  it.each([
    ['card_credit', 'credits'],
    ['promo', 'codes'],
    ['gift_card', 'gift_cards'],
    ['store_credit', 'gift_cards'],
    ['points', 'points'],
    ['refund', 'refunds'],
    ['benefit', 'benefits'],
    ['price_drop', 'returns'],
    ['free_trial', 'returns'],
    ['return_window', 'returns'],
    ['protection', 'protections'],
    ['settlement', 'other'],
  ] as const)('%s → %s', (type, kind) => expect(kindOf({ type })).toBe(kind));
});

describe('moneyList', () => {
  const items = [
    opp({ id: 'kfc', type: 'promo', value_estimate: 10, currency: 'TTD', expires_at: days(3) }),
    opp({ id: 'uber', type: 'card_credit', value_estimate: 15, currency: 'USD', expires_at: days(9) }),
    opp({ id: 'gift', type: 'gift_card', value_estimate: 50, currency: 'TTD', expires_at: null }),
    opp({ id: 'prot', type: 'protection', value_estimate: null, currency: 'USD', expires_at: days(20) }),
    opp({ id: 'old', type: 'promo', status: 'expired', value_estimate: 5, currency: 'TTD', expires_at: days(-10) }),
    opp({ id: 'used', type: 'card_credit', status: 'claimed', value_estimate: 15, currency: 'USD', expires_at: days(-20) }),
  ];

  it('splits open items into this week, later and no end date', () => {
    const l = moneyList(items, 'open', 'all', NOW, new Map(), () => 'active');
    expect(l.sections.map((s) => [s.title, s.items.map((o) => o.id)])).toEqual([
      ['This week', ['kfc']],
      ['Later', ['uber', 'prot']],
      ['No end date', ['gift']],
    ]);
    expect(l.kinds).toEqual(['credits', 'codes', 'gift_cards', 'protections']);
    // Protections are coverage, not cash.
    expect(l.total).toEqual({ TTD: 60, USD: 15 });
  });

  it('filters by kind and subtracts what was already used', () => {
    const l = moneyList(items, 'open', 'credits', NOW, new Map([['uber', 5]]));
    expect(l.count).toBe(1);
    expect(l.total).toEqual({ USD: 10 });
  });

  it('lists used and missed items newest first, with what you got back or lost', () => {
    expect(moneyList(items, 'used', 'all', NOW, new Map([['used', 12]])).total).toEqual({ USD: 12 });
    const missed = moneyList(items, 'missed', 'all', NOW, new Map());
    expect(missed.sections).toHaveLength(1);
    expect(missed.sections[0]!.items.map((o) => o.id)).toEqual(['old']);
    expect(missed.total).toEqual({ TTD: 5 });
  });

  it('is empty when there is nothing in the view', () => {
    expect(moneyList([], 'open', 'all', NOW, new Map())).toEqual({ sections: [], kinds: [], total: {}, count: 0 });
  });
});

describe('confidence in the Money list', () => {
  const list = [
    opp({ id: 'kfc', type: 'promo', value_estimate: 10, currency: 'TTD', code: 'KFC10', expires_at: days(3) }),
    opp({ id: 'twice', type: 'refund', value_estimate: 85, currency: 'TTD', dedupe_key: 'double_charge:7290:2026-10-22:85:kfc', expires_at: null }),
    opp({ id: 'amex', type: 'card_credit', value_estimate: null, expires_at: days(2) }),
    opp({ id: 'mine', type: 'benefit', value_estimate: 300, currency: 'TTD', dedupe_key: 'manual:1', expires_at: days(30) }),
  ];

  it('keeps guesses in their own "Worth checking" group', () => {
    const l = moneyList(list, 'open', 'all', NOW, new Map());
    expect(l.sections.map((s) => [s.title, s.items.map((o) => o.id)])).toEqual([
      ['This week', ['kfc']],
      ['Later', ['mine']],
      ['Worth checking', ['amex', 'twice']],
    ]);
  });

  it('never counts guesses toward the total', () => {
    expect(moneyList(list, 'open', 'all', NOW, new Map()).total).toEqual({ TTD: 310 });
  });
});

describe('nextToUse', () => {
  it('puts real money ahead of unverified credits that expire about as soon', () => {
    const list = nextToUse(
      [
        opp({ id: 'amex', value_estimate: null, expires_at: days(2) }),
        opp({ id: 'kfc', type: 'promo', value_estimate: 10, expires_at: days(5) }),
        opp({ id: 'courts', type: 'gift_card', value_estimate: 50, expires_at: days(12) }),
        opp({ id: 'nodate', type: 'gift_card', value_estimate: 50, expires_at: null }),
        opp({ id: 'prot', type: 'protection', value_estimate: null, expires_at: days(1) }),
      ],
      NOW,
      2,
    );
    expect(list.map((o) => o.id)).toEqual(['kfc', 'courts']);
  });

  it('still shows unverified credits when nothing else is due', () => {
    expect(nextToUse([opp({ id: 'amex', value_estimate: null, expires_at: days(2) })], NOW).map((o) => o.id)).toEqual(['amex']);
  });
});

describe('setupSteps', () => {
  it('is done once there are cards and something has been read', () => {
    expect(setupSteps({ userCards: [], receipts: [], opportunities: [] }).map((s) => s.done)).toEqual([false, false]);
    expect(setupSteps({ userCards: [{}], receipts: [], opportunities: [opp({ source_message_id: 'm1' })] }).every((s) => s.done)).toBe(true);
    expect(setupSteps({ userCards: [{}], receipts: [{}], opportunities: [] }).every((s) => s.done)).toBe(true);
  });
});

describe('in-app deals seen in email', () => {
  const inApp = (o: Parameters<typeof opp>[0]) =>
    opp({ type: 'promo', category: 'promos', value_estimate: null, user_card_id: null, benefit_id: null, merchant: 'Uber Eats', dedupe_key: 'inapp:uber-eats:bogo-shack:2026-10-19', created_at: '2026-10-20T10:00:00Z', ...o });

  it('sit in their own section, never in totals, Use soon, or Missed', () => {
    const code = opp({ id: 'code', type: 'promo', category: 'promos', value_estimate: 10, expires_at: '2026-10-25T00:00:00Z', user_card_id: null, benefit_id: null });
    const live = inApp({ id: 'live', expires_at: '2026-10-27T23:59:59Z' });
    const gone = inApp({ id: 'gone', expires_at: '2026-10-21T23:59:59Z' });
    const list = moneyList([code, live, gone], 'open', 'all', NOW, new Map());
    expect(list.sections.map((s) => [s.title, s.items.map((o) => o.id)])).toEqual([['This week', ['code']], ['In the app this week', ['live']]]);
    expect(list.total).toEqual({ USD: 10 });
    expect(nextToUse([code, live], NOW).map((o) => o.id)).toEqual(['code']);
    expect(viewOf(gone, NOW)).toBeNull();
  });
});
