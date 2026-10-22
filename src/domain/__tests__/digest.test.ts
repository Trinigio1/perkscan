import { monthlyRecap, nextDigestDate, planWeeklyDigest, shareText } from '../digest';
import { opp, rec } from '../__fixtures__/opportunities';

// Wednesday 2026-10-21, 12:00 local
const NOW = new Date(2026, 9, 21, 12);

describe('nextDigestDate', () => {
  it('is the coming Sunday at 6pm', () => {
    const d = nextDigestDate(NOW);
    expect([d.getDay(), d.getDate(), d.getHours()]).toEqual([0, 25, 18]);
  });
  it('rolls to next week once this Sunday’s has passed', () => {
    expect(nextDigestDate(new Date(2026, 9, 25, 19)).getDate()).toBe(1);
  });
});

describe('planWeeklyDigest', () => {
  const inDays = (n: number) => new Date(2026, 9, 25, 18 + 24 * n).toISOString();
  it('totals what expires in the week after it fires, per currency', () => {
    const d = planWeeklyDigest(
      [
        opp({ title: 'Uber Cash', value_estimate: 10, currency: 'USD', expires_at: inDays(2) }),
        opp({ title: 'KFC code', type: 'promo', category: 'promos', value_estimate: 50, currency: 'TTD', expires_at: inDays(5) }),
        opp({ title: 'Too late', value_estimate: 99, expires_at: inDays(9) }),
        opp({ title: 'Used up', id: 'used', value_estimate: 5, expires_at: inDays(1) }),
      ],
      [rec('used', 5)],
      NOW,
      'TTD',
    );
    expect(d?.title).toBe('TT$50 + US$10 at risk this week');
    expect(d?.body).toBe('Uber Cash, KFC code — use them before they expire.');
  });
  it('counts items when none has a known amount, and stays quiet when nothing expires', () => {
    expect(planWeeklyDigest([opp({ title: 'Trial', value_estimate: null, expires_at: inDays(1) })], [], NOW, 'USD')?.title).toBe('1 thing expires this week');
    expect(planWeeklyDigest([opp({ expires_at: inDays(20) })], [], NOW, 'USD')).toBeNull();
  });
});

describe('monthlyRecap', () => {
  it('adds up what you recovered and missed in the month, and last month for comparison', () => {
    const used = opp({ id: 'u', title: 'Dining credit', currency: 'USD' });
    const missed = opp({ id: 'm', value_estimate: 15, currency: 'USD', status: 'expired', expires_at: '2026-10-05T00:00:00Z' });
    const r = monthlyRecap([used, missed], [rec('u', 12, '2026-10-03T12:00:00Z'), rec('u', 7, '2026-09-10T12:00:00Z')], new Date(2026, 9, 1), NOW);
    expect(r.recovered).toEqual({ USD: 12 });
    expect(r.used).toEqual([{ title: 'Dining credit', amount: 12, currency: 'USD' }]);
    expect(r.missed).toEqual({ USD: 15 });
    expect(r.missedCount).toBe(1);
    expect(r.previousRecovered).toEqual({ USD: 7 });
  });
});

describe('shareText', () => {
  it('shares only the total', () => {
    expect(shareText('TT$450')).toBe('I found TT$450 I was leaving on the table with PerkScan.');
  });
});
