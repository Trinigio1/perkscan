import { confidenceOf, rankCompare, urgency } from '../confidence';
import { opp } from '../__fixtures__/opportunities';

const NOW = new Date('2026-10-23T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe('confidenceOf', () => {
  it.each([
    ['anything you added', opp({ type: 'gift_card', value_estimate: null, dedupe_key: 'manual:abc' }), 'confirmed'],
    ['a verified card credit (it has an amount)', opp({ type: 'card_credit', value_estimate: 15 }), 'confirmed'],
    ['an unverified card credit', opp({ type: 'card_credit', value_estimate: null }), 'check'],
    ['a store price-adjustment window', opp({ type: 'price_drop', value_estimate: null }), 'confirmed'],
    ['a warranty stated on a receipt', opp({ type: 'protection', benefit_id: null }), 'likely'],
    ['a possible double charge', opp({ type: 'refund', dedupe_key: 'double_charge:1:2:3:x' }), 'check'],
    ['a refund an email offers', opp({ type: 'refund', value_estimate: 412.8, dedupe_key: 'refund:air:x:' }), 'likely'],
    ['a settlement matched from the catalog', opp({ type: 'settlement', dedupe_key: 'settlement:acme_2026' }), 'check'],
    ['a settlement an email announced', opp({ type: 'settlement', dedupe_key: 'settlement:acme:claim:2026-12-01' }), 'likely'],
    ['a promo with a code', opp({ type: 'promo', value_estimate: null, code: 'SAVE10' }), 'likely'],
    ['a promo with nothing concrete', opp({ type: 'promo', value_estimate: null, code: null }), 'check'],
    ['a trial with an end date', opp({ type: 'free_trial', value_estimate: null, expires_at: days(5) }), 'likely'],
  ] as const)('%s → %s', (_, o, expected) => expect(confidenceOf(o)).toBe(expected));

  it('uses the card terms for card protections', () => {
    const o = opp({ type: 'protection', benefit_id: 'gold__purchase_protection' });
    expect(confidenceOf(o, () => 'active')).toBe('confirmed');
    expect(confidenceOf(o, () => 'TODO_VERIFY')).toBe('check');
  });
});

describe('ranking', () => {
  it('buckets by how soon it expires', () => {
    expect([days(1), days(5), days(20), days(90), null].map((d) => urgency({ expires_at: d }, NOW))).toEqual([0, 1, 2, 3, 4]);
  });

  it('puts what you’d lose soonest first, then the surer thing, then the bigger amount', () => {
    const items = [
      opp({ id: 'credit-later', type: 'card_credit', value_estimate: 200, currency: 'USD', expires_at: days(60) }),
      opp({ id: 'guess-soon', type: 'promo', value_estimate: null, code: null, expires_at: days(1) }),
      opp({ id: 'code-soon', type: 'promo', value_estimate: 10, currency: 'TTD', code: 'A', expires_at: days(2) }),
      opp({ id: 'big-soon', type: 'gift_card', value_estimate: 50, currency: 'TTD', code: 'B', expires_at: days(2) }),
      opp({ id: 'mine-soon', type: 'benefit', value_estimate: 5, currency: 'TTD', dedupe_key: 'manual:x', expires_at: days(1) }),
    ];
    expect(items.sort(rankCompare(NOW)).map((o) => o.id)).toEqual(['mine-soon', 'big-soon', 'code-soon', 'guess-soon', 'credit-later']);
  });

  it('doesn’t compare amounts across currencies', () => {
    const tt = opp({ id: 'tt', type: 'promo', value_estimate: 100, currency: 'TTD', code: 'A', expires_at: days(10) });
    const us = opp({ id: 'us', type: 'promo', value_estimate: 20, currency: 'USD', code: 'B', expires_at: days(9) });
    // Same bucket and confidence: falls through to the earlier date, not the bigger number.
    expect([tt, us].sort(rankCompare(NOW)).map((o) => o.id)).toEqual(['us', 'tt']);
  });
});
