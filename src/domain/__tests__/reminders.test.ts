import { MAX_REMINDERS, planCreditReminders } from '../reminders';
import { opp, rec } from '../__fixtures__/opportunities';

const NOW = new Date(2026, 9, 1, 9, 0, 0); // Oct 1 2026, 09:00 local

describe('planCreditReminders', () => {
  it('schedules 7-day and 2-day reminders at 10:00 local', () => {
    const o = opp({ title: 'Uber Cash', value_estimate: 15, expires_at: new Date(2026, 10, 1).toISOString() });
    const r = planCreditReminders([o], [], NOW);
    expect(r.map((x) => x.id)).toEqual([`credit-${o.id}-7d`, `credit-${o.id}-2d`]);
    expect(r[0]!.fireAt).toEqual(new Date(2026, 9, 25, 10, 0, 0));
    expect(r[1]!.fireAt).toEqual(new Date(2026, 9, 30, 10, 0, 0));
    expect(r[0]!.body).toContain('$15');
  });

  it('skips reminders already in the past', () => {
    const o = opp({ expires_at: new Date(2026, 9, 4).toISOString() });
    const r = planCreditReminders([o], [], NOW);
    expect(r.map((x) => x.id)).toEqual([`credit-${o.id}-2d`]);
  });

  it('skips fully used, claimed, and non-credit items', () => {
    const used = opp({ value_estimate: 10, expires_at: new Date(2026, 10, 1).toISOString() });
    const r = planCreditReminders([
      used,
      opp({ status: 'claimed', expires_at: new Date(2026, 10, 1).toISOString() }),
      opp({ type: 'promo', category: 'promos', expires_at: new Date(2026, 10, 1).toISOString() }),
    ], [rec(used.id, 10)], NOW);
    expect(r).toHaveLength(0);
  });

  it('still reminds about credits with unverified amounts', () => {
    const r = planCreditReminders([opp({ value_estimate: null, expires_at: new Date(2026, 10, 1).toISOString() })], [], NOW);
    expect(r).toHaveLength(2);
    expect(r[0]!.body.startsWith('Your ')).toBe(true);
  });

  it('caps the number of reminders', () => {
    const many = Array.from({ length: 40 }, () => opp({ expires_at: new Date(2026, 10, 1).toISOString() }));
    expect(planCreditReminders(many, [], NOW)).toHaveLength(MAX_REMINDERS);
  });
});
