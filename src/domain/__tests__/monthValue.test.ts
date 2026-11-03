import { opp } from '../__fixtures__/opportunities';
import { becameUsable, knewQuestions, monthValue, PLAN } from '../monthValue';
import type { Recovered } from '../types';

const from = new Date('2026-11-01T00:00:00');
const to = new Date('2026-12-01T00:00:00');
const back = (id: string, amount: number, at: string, knew: boolean | null | undefined, oppId: string | null = null): Recovered => ({ id, opportunity_id: oppId, amount, currency: 'USD', recovered_at: at, knew_before: knew });

describe('monthValue', () => {
  const opps = [
    opp({ id: 'credit', type: 'card_credit', value_estimate: 10, period_start: '2026-11-01', created_at: '2026-10-01T00:00:00Z' }),
    opp({ id: 'old_credit', type: 'card_credit', value_estimate: 10, period_start: '2026-10-01', created_at: '2026-10-01T00:00:00Z' }),
    opp({ id: 'drop', type: 'price_drop', value_estimate: 70, created_at: '2026-11-05T12:00:00Z' }),
    opp({ id: 'guess', type: 'refund', value_estimate: 500, dedupe_key: 'double_charge:x', created_at: '2026-11-06T12:00:00Z' }),
    opp({ id: 'gone', type: 'promo', value_estimate: 20, status: 'dismissed', created_at: '2026-11-07T12:00:00Z' }),
    opp({ id: 'nothing', type: 'promo', value_estimate: null, created_at: '2026-11-08T12:00:00Z' }),
  ];

  it('counts new money this month: credits by the period they start, others by when found; never guesses or dismissed', () => {
    const v = monthValue(opps, [], from, to);
    expect(v.newValue).toEqual({ USD: 80 });
    expect(v.newCount).toBe(2);
    expect(v.newBySource.map((s) => [s.label, s.total])).toEqual([
      ['Returns & trials', { USD: 70 }],
      ['Card credits', { USD: 10 }],
    ]);
    expect(becameUsable(opps[0]!)).toBe('2026-11-01');
  });

  it('splits what you used by your own answer, and the plan pays for itself only on what PerkScan found', () => {
    const v = monthValue(
      opps,
      [back('r1', 70, '2026-11-10T10:00:00Z', false, 'drop'), back('r2', 10, '2026-11-03T10:00:00Z', true, 'credit'), back('r3', 25, '2026-11-12T10:00:00Z', null), back('r4', 99, '2026-10-12T10:00:00Z', false)],
      from,
      to,
    );
    expect(v.used).toEqual({ USD: 105 });
    expect(v.found).toEqual({ USD: 70 });
    expect(v.knew).toEqual({ USD: 10 });
    expect([v.usedCount, v.foundCount, v.knewCount, v.unanswered]).toEqual([3, 1, 1, 1]);
    expect(v.paidFor).toBe(Math.round((70 / PLAN.monthly) * 10) / 10);
  });

  it('never says the plan paid for itself when nothing was found', () => {
    expect(monthValue(opps, [back('r2', 10, '2026-11-03T10:00:00Z', true)], from, to).paidFor).toBeNull();
  });
});

describe('knewQuestions', () => {
  it('asks about recent unanswered money, newest first; never where the answer isn’t supported', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const q = knewQuestions(
      [back('a', 70, '2026-11-10T10:00:00Z', null, 'drop'), back('b', 25, '2026-11-18T10:00:00Z', null), back('c', 10, '2026-11-11T10:00:00Z', true), back('d', 5, '2026-08-01T10:00:00Z', null), back('e', 9, '2026-11-19T10:00:00Z', undefined)],
      [opp({ id: 'drop', title: 'Price drop at Target' })],
      now,
    );
    expect(q.map((x) => [x.recovered.id, x.opp?.title ?? null])).toEqual([
      ['b', null],
      ['a', 'Price drop at Target'],
    ]);
  });
});

describe('savings in the month', () => {
  const s = (per: 'once' | 'month' | 'year', started_on: string, ended_on: string | null = null) => ({ id: per, key: `other:${per}`, kind: 'other' as const, title: per, amount: 20, currency: 'USD', per, started_on, ended_on });
  it('counts one-offs once, monthly ones every month they run, yearly ones in their month; all as found', () => {
    const v = monthValue([], [], from, to, undefined, [s('once', '2026-11-04'), s('month', '2026-09-15'), s('month', '2026-08-01', '2026-10-31'), s('year', '2025-11-20'), s('year', '2026-03-01'), s('once', '2026-10-30')]);
    expect(v.saved).toEqual({ USD: 60 });
    expect(v.found).toEqual({ USD: 60 });
    expect(v.used).toEqual({ USD: 60 });
    expect(v.savedCount).toBe(3);
  });
});
