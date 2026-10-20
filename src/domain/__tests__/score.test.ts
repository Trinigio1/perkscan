import { computeScore, isAtRisk, remainingValue } from '../score';
import { opp, rec } from '../__fixtures__/opportunities';

const NOW = new Date('2026-10-20T12:00:00Z');

describe('computeScore', () => {
  it('counts expired opportunities from this year as left on the table', () => {
    const s = computeScore([
      opp({ status: 'expired', value_estimate: 15, expires_at: '2026-10-01T00:00:00Z' }),
      opp({ status: 'expired', value_estimate: 50, expires_at: '2026-07-01T00:00:00Z' }),
    ], [], NOW);
    expect(s.leftOnTable).toBe(65);
  });

  it('ignores misses from previous years', () => {
    const s = computeScore([opp({ status: 'expired', value_estimate: 100, expires_at: '2025-12-01T00:00:00Z' })], [], NOW);
    expect(s.leftOnTable).toBe(0);
  });

  it('treats open-but-past-due as missed (sync may lag)', () => {
    const s = computeScore([opp({ status: 'open', value_estimate: 20, expires_at: '2026-10-19T00:00:00Z' })], [], NOW);
    expect(s.leftOnTable).toBe(20);
    expect(s.atRiskThisWeek).toBe(0);
  });

  it('subtracts partial use from what was left on the table', () => {
    const o = opp({ status: 'expired', value_estimate: 50, expires_at: '2026-07-01T00:00:00Z' });
    const s = computeScore([o], [rec(o.id, 20)], NOW);
    expect(s.leftOnTable).toBe(30);
  });

  it('excludes claimed and dismissed opportunities', () => {
    const s = computeScore([
      opp({ status: 'claimed', value_estimate: 99, expires_at: '2026-07-01T00:00:00Z' }),
      opp({ status: 'dismissed', value_estimate: 99, expires_at: '2026-07-01T00:00:00Z' }),
    ], [], NOW);
    expect(s.leftOnTable).toBe(0);
    expect(s.atRiskThisWeek).toBe(0);
    expect(s.available).toBe(0);
  });

  it('puts open items expiring within 7 days at risk, soonest first', () => {
    const later = opp({ value_estimate: 10, expires_at: '2026-10-26T00:00:00Z' });
    const sooner = opp({ value_estimate: 5, expires_at: '2026-10-22T00:00:00Z' });
    const far = opp({ value_estimate: 100, expires_at: '2026-12-01T00:00:00Z' });
    const s = computeScore([later, far, sooner], [], NOW);
    expect(s.atRiskThisWeek).toBe(15);
    expect(s.atRiskItems.map((o) => o.id)).toEqual([sooner.id, later.id]);
    expect(s.available).toBe(100);
  });

  it('counts unverified values as $0 and reports them', () => {
    const s = computeScore([
      opp({ value_estimate: null, expires_at: '2026-10-22T00:00:00Z' }),
      opp({ status: 'expired', value_estimate: null, expires_at: '2026-09-01T00:00:00Z' }),
    ], [], NOW);
    expect(s.atRiskThisWeek).toBe(0);
    expect(s.leftOnTable).toBe(0);
    expect(s.unverifiedCount).toBe(2);
  });

  it('does not count offers without a dollar value as unverified', () => {
    const s = computeScore([opp({ type: 'free_trial', category: 'returns_trials', value_estimate: null, expires_at: '2026-10-25T00:00:00Z' })], [], NOW);
    expect(s.unverifiedCount).toBe(0);
  });

  it('sums recovered this year and all time', () => {
    const s = computeScore([], [rec('a', 10, '2026-02-01T00:00:00Z'), rec('b', 5.5, '2025-12-15T00:00:00Z')], NOW);
    expect(s.recoveredThisYear).toBe(10);
    expect(s.recoveredAllTime).toBe(15.5);
  });

  it('breaks totals down by category in display order', () => {
    const s = computeScore([
      opp({ status: 'expired', value_estimate: 15, expires_at: '2026-10-01T00:00:00Z' }),
      opp({ type: 'promo', category: 'promos', status: 'expired', value_estimate: 7, expires_at: '2026-08-01T00:00:00Z' }),
    ], [], NOW);
    expect(s.byCategory[0]).toMatchObject({ category: 'card_credits', leftOnTable: 15 });
    expect(s.byCategory.find((c) => c.category === 'promos')?.leftOnTable).toBe(7);
    expect(s.byCategory).toHaveLength(8);
  });

  it('reports the share of value captured this year', () => {
    const missed = opp({ status: 'expired', value_estimate: 30, expires_at: '2026-09-01T00:00:00Z' });
    const used = opp({ status: 'claimed', value_estimate: 10, expires_at: '2026-09-01T00:00:00Z' });
    expect(computeScore([missed, used], [rec(used.id, 10)], NOW).captureRate).toBe(0.25);
    expect(computeScore([], [], NOW).captureRate).toBeNull();
  });

  it('avoids floating point drift', () => {
    const s = computeScore([
      opp({ status: 'expired', value_estimate: 0.1, expires_at: '2026-10-01T00:00:00Z' }),
      opp({ status: 'expired', value_estimate: 0.2, expires_at: '2026-10-01T00:00:00Z' }),
    ], [], NOW);
    expect(s.leftOnTable).toBe(0.3);
  });
});

describe('helpers', () => {
  it('remainingValue never goes negative', () => {
    const o = opp({ value_estimate: 10 });
    expect(remainingValue(o, new Map([[o.id, 25]]))).toBe(0);
  });
  it('isAtRisk excludes already-expired items', () => {
    expect(isAtRisk(opp({ expires_at: '2026-10-20T11:59:59Z' }), NOW)).toBe(false);
    expect(isAtRisk(opp({ expires_at: '2026-10-27T12:00:00Z' }), NOW)).toBe(true);
    expect(isAtRisk(opp({ expires_at: '2026-10-27T12:00:01Z' }), NOW)).toBe(false);
  });
});
