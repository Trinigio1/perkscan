import { groupAtRisk, sourcesLine } from '../atRisk';
import { opp } from '../__fixtures__/opportunities';

const label = (id: string) => ({ uc1: 'Amex Platinum ·· 1001', uc2: 'Scotiabank Visa ·· 7290' })[id] ?? '';

describe('groupAtRisk', () => {
  it('groups by card first, then by store, soonest expiry first', () => {
    const groups = groupAtRisk(
      [
        opp({ id: 'a', title: 'Uber Cash', user_card_id: 'uc1', value_estimate: 15, currency: 'USD', expires_at: '2026-10-31T23:59:59Z' }),
        opp({ id: 'b', title: '$10 off', type: 'promo', user_card_id: null, merchant: 'KFC', value_estimate: 10, currency: 'TTD', expires_at: '2026-10-24T23:59:59Z' }),
        opp({ id: 'c', title: 'Digital entertainment', user_card_id: 'uc1', value_estimate: 20, currency: 'USD', expires_at: '2026-10-31T23:59:59Z' }),
      ],
      new Map(),
      label,
    );
    expect(groups.map((g) => [g.kind, g.label, g.items.length])).toEqual([
      ['store', 'KFC', 1],
      ['card', 'Amex Platinum ·· 1001', 2],
    ]);
    expect(groups[1]!.total).toEqual({ USD: 35 });
    expect(groups[0]!.total).toEqual({ TTD: 10 });
  });

  it('subtracts what was already used, and keeps currencies apart', () => {
    const groups = groupAtRisk(
      [
        opp({ id: 'a', user_card_id: 'uc2', value_estimate: 100, currency: 'TTD', expires_at: '2026-10-25T00:00:00Z' }),
        opp({ id: 'b', user_card_id: 'uc2', value_estimate: 5, currency: 'USD', expires_at: '2026-10-26T00:00:00Z' }),
      ],
      new Map([['a', 40]]),
      label,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.total).toEqual({ TTD: 60, USD: 5 });
  });

  it('merges the same store regardless of case, and puts unknown sources under Other', () => {
    const groups = groupAtRisk(
      [
        opp({ id: 'a', user_card_id: null, merchant: 'Courts', expires_at: '2026-10-25T00:00:00Z' }),
        opp({ id: 'b', user_card_id: null, merchant: 'COURTS', expires_at: '2026-10-26T00:00:00Z' }),
        opp({ id: 'c', user_card_id: null, merchant: null, expires_at: '2026-10-27T00:00:00Z' }),
      ],
      new Map(),
      label,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Courts', 2],
      ['Other', 1],
    ]);
  });

  it('counts items with no known value as nothing', () => {
    const [g] = groupAtRisk([opp({ id: 'a', user_card_id: 'uc1', value_estimate: null, currency: 'USD', expires_at: '2026-10-25T00:00:00Z' })], new Map(), label);
    expect(g!.total).toEqual({ USD: 0 });
  });
});

describe('sourcesLine', () => {
  const g = (labelText: string, kind: 'card' | 'store', titles: string[]) => ({
    key: labelText,
    kind,
    label: labelText,
    items: titles.map((t, i) => opp({ id: `${labelText}${i}`, title: t })),
    total: {},
    firstExpiry: '',
  });

  it('names the credit when a card has just one, otherwise the card or store', () => {
    expect(sourcesLine([g('Amex Platinum ·· 1001', 'card', ['Uber Cash']), g('KFC', 'store', ['$10 off'])])).toBe('Uber Cash, KFC');
    expect(sourcesLine([g('Amex Platinum ·· 1001', 'card', ['Uber Cash', 'Saks'])])).toBe('Amex Platinum ·· 1001');
  });

  it('says how many more there are', () => {
    expect(sourcesLine([g('A', 'store', ['x']), g('B', 'store', ['y']), g('C', 'store', ['z']), g('D', 'store', ['w'])])).toBe('A, B +2 more');
  });

  it('is empty when nothing is at risk', () => {
    expect(sourcesLine([])).toBeNull();
  });
});
