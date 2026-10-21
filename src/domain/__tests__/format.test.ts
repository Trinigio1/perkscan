import { addToBag, currencyPrefix, formatBag, formatMoney, relativeDays, type MoneyBag } from '../format';

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

describe('currencies', () => {
  it('uses a bare $ only for a US user’s dollars', () => {
    expect(formatMoney(25, { currency: 'USD', home: 'USD' })).toBe('$25');
    expect(formatMoney(25, { currency: 'USD', home: 'TTD' })).toBe('US$25');
    expect(formatMoney(450, { currency: 'TTD', home: 'TTD' })).toBe('TT$450');
    expect(formatMoney(1200.5, { currency: 'TTD', home: 'USD' })).toBe('TT$1,200.50');
  });
  it('falls back to the ISO code for unknown currencies', () => {
    expect(currencyPrefix('XYZ', 'USD')).toBe('XYZ ');
  });
  it('never adds amounts across currencies', () => {
    const bag: MoneyBag = {};
    addToBag(bag, 'USD', 35);
    addToBag(bag, 'TTD', 400);
    addToBag(bag, 'TTD', 50.1);
    addToBag(bag, 'TTD', 0.2);
    expect(bag).toEqual({ USD: 35, TTD: 450.3 });
    expect(formatBag(bag, 'TTD')).toBe('TT$450.30 + US$35');
  });
  it('lists the home currency first and drops zeros', () => {
    expect(formatBag({ TTD: 10, USD: 0, CAD: 5 }, 'USD')).toBe('TT$10 + CA$5');
    expect(formatBag({ CAD: 5, TTD: 10 }, 'CAD')).toBe('CA$5 + TT$10');
    expect(formatBag({}, 'TTD')).toBe('TT$0');
  });
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
