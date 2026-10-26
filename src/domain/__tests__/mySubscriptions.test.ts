import { mySubscriptions } from '../mySubscriptions';
import type { Receipt } from '../types';

const NOW = new Date('2026-10-27T12:00:00Z');
const r = (merchant: string, total: number, date: string, purchase_type: string | null = null, currency = 'USD') =>
  ({ merchant, total, currency, purchase_date: date, purchase_type }) as Pick<Receipt, 'merchant' | 'total' | 'currency' | 'purchase_date' | 'purchase_type'>;

describe('mySubscriptions', () => {
  it('finds the same amount charged about monthly, and what it costs a year', () => {
    const subs = mySubscriptions(
      [
        r('Anthropic, PBC', 20, '2026-08-21'),
        r('Anthropic, PBC', 20, '2026-09-21'),
        r('Anthropic, PBC', 20, '2026-10-21'),
        r('Anthropic, PBC', 5, '2026-10-02'), // a one-time credit purchase
        r('Chipotle Mexican Grill', 23.43, '2026-10-01', 'restaurant'),
        r('Chipotle Mexican Grill', 24.5, '2026-10-20', 'restaurant'),
        r('Chipotle Mexican Grill', 26.16, '2026-09-18', 'restaurant'),
      ],
      NOW,
      false,
    );
    expect(subs.map((s) => [s.name, s.amount, s.period, s.yearly, s.charges])).toEqual([['Claude Pro', 20, 'monthly', 240, 3]]);
  });

  it('shows a student price only where it was checked and is cheaper', () => {
    const receipts = [r('Spotify USA', 12.99, '2026-09-10'), r('Spotify USA', 12.99, '2026-10-10'), r('Apple Music', 6.99, '2026-10-01', 'subscription')];
    const asStudent = mySubscriptions(receipts, NOW, true);
    expect(asStudent.find((s) => s.name === 'Spotify Premium')?.student).toMatchObject({ studentMonthly: 6.99, savesYearly: 72 });
    expect(asStudent.find((s) => s.name === 'Apple Music')?.student).toBeNull(); // already on the student price
    expect(mySubscriptions(receipts, NOW, false).every((s) => s.student === null)).toBe(true);
  });

  it('sees a yearly charge, and ignores old ones', () => {
    const subs = mySubscriptions([r('Dropbox', 119.88, '2025-10-30'), r('Dropbox', 119.88, '2026-10-29'.replace('29', '20')), r('Netflix', 15.49, '2025-01-01'), r('Netflix', 15.49, '2025-02-01')], NOW, false);
    expect(subs.map((s) => [s.name, s.period, s.yearly])).toEqual([['Dropbox', 'yearly', 119.88]]);
  });
});
