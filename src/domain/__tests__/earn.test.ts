import { bestEarn, capLabel, earnCategoriesFor, missedEarnings, type CardReward, type EarnRate } from '../earn';
import { guessCategory } from '../checkout';
import { earnFileSchema } from '../earnSchema';
import earnFile from '../../../seed/earn_rates.json';

// The real catalog, so the tests also prove the file says what PerkScan relies on.
const file = earnFileSchema.parse(earnFile);
const rates: EarnRate[] = file.cards.flatMap((c) =>
  c.rates.map((r) => ({ card_id: c.card_id, category: r.category, rate: r.rate, merchants: r.merchants ?? [], cap: r.cap ?? null, cap_period: r.cap_period ?? null, needs: r.needs ?? null, note: r.note ?? null, source_url: r.source_url })),
);
const rewards: CardReward[] = file.cards.map((c) => ({ card_id: c.card_id, kind: c.reward.kind, cents_per_unit: c.reward.cents_per_unit, value_basis: c.reward.value_basis }));
const card = (id: string, kind: 'card' | 'membership' = 'card') => ({ id, kind });
const cards = ['boa_premium_rewards', 'amex_gold', 'apple_card', 'chase_freedom_flex', 'amex_hilton_surpass', 'citi_double_cash', 'amazon_prime'].map((id) => card(id, id === 'amazon_prime' ? 'membership' : 'card'));
const wallet = (...ids: string[]) => ({ userCards: ids.map((id) => ({ id: `uc-${id}`, card_id: id })), cards, rates, rewards });

describe('the earn-rate catalog', () => {
  it('is valid and every rate has an issuer source', () => {
    expect(file.cards.length).toBeGreaterThanOrEqual(25);
    expect(rates.every((r) => r.source_url.startsWith('https://'))).toBe(true);
  });
});

describe('earnCategoriesFor', () => {
  it('reads the kind of purchase from the store', () => {
    expect(earnCategoriesFor('delivery_rides', 'Uber Eats')).toEqual(['dining']);
    expect(earnCategoriesFor('delivery_rides', 'Uber')).toEqual(['transit', 'travel']);
    expect(earnCategoriesFor('travel', 'American Airlines')).toEqual(['flights', 'travel']);
    expect(earnCategoriesFor('travel', 'Marriott Miami')).toEqual(['hotels', 'travel']);
    expect(earnCategoriesFor('subscriptions', 'Netflix')).toEqual(['streaming']);
    expect(earnCategoriesFor('other', 'Somewhere')).toEqual([]);
  });
});

describe('bestEarn', () => {
  it('at a restaurant, Amex Gold’s 4x points beats 2x on Premium Rewards by their stated cash values', () => {
    const r = bestEarn('Chipotle', 'dining', wallet('boa_premium_rewards', 'amex_gold'));
    expect(r.best?.cardId).toBe('amex_gold');
    expect(r.best?.label).toBe('4x points');
    expect(r.best?.valueLabel).toBe('≈ 2.4% back in cash value');
    expect(r.picks.map((p) => [p.cardId, p.value])).toEqual([['amex_gold', 2.4], ['boa_premium_rewards', 2]]);
    expect(capLabel(r.best!.rate)).toBe('on up to $50,000 a year');
  });

  it('everywhere else, 2% cash beats 1.5 points worth 1¢', () => {
    const r = bestEarn('Best Buy', 'electronics', wallet('boa_premium_rewards', 'citi_double_cash'));
    expect(r.best?.cardId).toBe('citi_double_cash');
    expect(r.best?.label).toBe('2% back');
  });

  it('says when a rate needs Apple Pay, and prefers 3% at Apple', () => {
    expect(bestEarn('Target', 'shopping', wallet('apple_card')).picks[0]!.rate.needs).toBe('Apple Pay');
    expect(bestEarn('Apple Store', 'electronics', wallet('apple_card')).picks[0]!.label).toBe('3% back');
  });

  it('never ranks points with no stated cash value against cash, and shows them by rate', () => {
    const r = bestEarn('Publix', 'groceries', wallet('amex_hilton_surpass', 'citi_double_cash'));
    expect(r.best?.cardId).toBe('citi_double_cash');
    const hilton = r.picks.find((p) => p.cardId === 'amex_hilton_surpass')!;
    expect([hilton.label, hilton.value, hilton.valueLabel]).toEqual(['6x points', null, null]);
  });

  it('keeps rotating categories as a tip, never the answer, and skips memberships', () => {
    const r = bestEarn('Publix', 'groceries', wallet('chase_freedom_flex', 'amazon_prime'));
    expect(r.picks.map((p) => [p.cardId, p.label])).toEqual([['chase_freedom_flex', '1% back']]);
    expect(r.maybe.map((p) => p.rate.category)).toEqual(['rotating']);
  });

  it('calls a tie a tie', () => {
    expect(bestEarn('Store', 'other', wallet('citi_double_cash', 'citi_double_cash')).best?.cardId).toBe('citi_double_cash');
    expect(bestEarn('Store', 'other', { ...wallet('boa_premium_rewards'), userCards: [{ id: 'a', card_id: 'boa_premium_rewards' }, { id: 'b', card_id: 'citi_double_cash' }], rates: rates.filter((x) => x.card_id !== 'citi_double_cash').concat({ ...rates.find((x) => x.card_id === 'citi_double_cash' && x.category === 'everything')!, rate: 1.5 }) }).best).toBeNull();
  });
});

describe('missedEarnings', () => {
  const receipt = (merchant: string, total: number, type: string | null, card: string, date = '2026-10-10') => ({ merchant, total, currency: 'USD', purchase_date: date, purchase_type: type, matched_user_card_id: `uc-${card}` });
  const categoryOf = (m: string, t: string | null) => guessCategory(m, t ? [{ id: 'x', merchant: m, total: 1, currency: 'USD', purchase_date: null, last_four: null, purchase_type: t, matched_user_card_id: null, kind: 'receipt', pending: false }] : []);

  it('adds what the right card would have earned, as a floor', () => {
    const m = missedEarnings(
      [
        receipt('Chipotle', 100, 'restaurant', 'boa_premium_rewards'), // Gold: 2.4% vs 2% -> $0.40
        receipt('Best Buy', 500, 'electronics', 'boa_premium_rewards'), // Double Cash: 2% vs 1.5% -> $2.50
        receipt('Chipotle', 50, 'restaurant', 'amex_gold'), // already the best
        receipt('Old', 900, 'electronics', 'boa_premium_rewards', '2026-01-01'), // before the window
      ],
      wallet('boa_premium_rewards', 'amex_gold', 'citi_double_cash'),
      categoryOf,
      '2026-08-01',
    );
    expect(m.total).toBe(2.9);
    expect(m.count).toBe(2);
    expect(m.biggest).toMatchObject({ merchant: 'Best Buy', extra: 2.5 });
  });

  it('never counts a rate that needs Apple Pay', () => {
    expect(missedEarnings([receipt('Target', 100, 'other_goods', 'boa_premium_rewards')], wallet('boa_premium_rewards', 'apple_card'), categoryOf, '2026-08-01').total).toBe(0);
  });
});
