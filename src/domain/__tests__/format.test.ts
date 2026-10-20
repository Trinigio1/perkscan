import { formatMoney, relativeDays } from '../format';

describe('formatMoney', () => {
  it.each([
    [0, '$0'],
    [15, '$15'],
    [1234, '$1,234'],
    [1234567.5, '$1,234,567.50'],
    [12.345, '$12.35'],
    [-40, '-$40'],
  ])('%p -> %p', (n, out) => expect(formatMoney(n)).toBe(out));
  it('can force cents', () => expect(formatMoney(5, { cents: true })).toBe('$5.00'));
});

describe('relativeDays', () => {
  const now = new Date(2026, 9, 20, 15);
  it('labels nearby days', () => {
    expect(relativeDays(new Date(2026, 9, 20, 23), now)).toBe('today');
    expect(relativeDays(new Date(2026, 9, 21, 1), now)).toBe('tomorrow');
    expect(relativeDays(new Date(2026, 9, 25), now)).toBe('in 5 days');
    expect(relativeDays(new Date(2026, 9, 17), now)).toBe('3 days ago');
  });
});
