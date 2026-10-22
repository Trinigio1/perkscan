const PREFIX: Record<string, string> = { USD: 'US$', TTD: 'TT$', CAD: 'CA$', JMD: 'J$', BBD: 'Bds$', GBP: '£', EUR: '€' };

/** The signed-in user's home currency; set by the data layer once the profile loads. */
let homeCurrency = 'USD';
export function setHomeCurrency(c: string) {
  homeCurrency = /^[A-Z]{3}$/.test(c) ? c : 'USD';
}
export function getHomeCurrency() {
  return homeCurrency;
}

/** "$" for a US user's dollars, "US$" / "TT$" etc. whenever there's room for confusion. */
export function currencyPrefix(currency: string, home = homeCurrency): string {
  if (currency === 'USD' && home === 'USD') return '$';
  return PREFIX[currency] ?? `${currency} `;
}

/**
 * "$1,234" / "TT$1,234" / "US$12.50". Whole amounts drop the cents.
 * Avoids Intl so it behaves the same on every engine.
 */
export function formatMoney(n: number, opts: { cents?: boolean; currency?: string; home?: string } = {}): string {
  const negative = n < 0;
  const abs = Math.abs(n);
  const showCents = opts.cents ?? !Number.isInteger(Math.round(abs * 100) / 100);
  const fixed = abs.toFixed(showCents ? 2 : 0);
  const [whole = '0', frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const home = opts.home ?? homeCurrency;
  return `${negative ? '-' : ''}${currencyPrefix(opts.currency ?? home, home)}${grouped}${frac ? `.${frac}` : ''}`;
}

/** Amounts per currency. Never added across currencies. */
export type MoneyBag = Record<string, number>;

export function addToBag(bag: MoneyBag, currency: string, amount: number): MoneyBag {
  bag[currency] = Math.round(((bag[currency] ?? 0) + amount) * 100) / 100;
  return bag;
}

/** "TT$450 + US$35", home currency first, zero amounts left out ("$0" style when empty). */
export function formatBag(bag: MoneyBag, home = homeCurrency): string {
  const entries = Object.entries(bag).filter(([, v]) => v !== 0);
  if (!entries.length) return formatMoney(0, { currency: home, home });
  entries.sort(([a, x], [b, y]) => (a === home ? -1 : b === home ? 1 : y - x));
  return entries.map(([c, v]) => formatMoney(v, { currency: c, home })).join(' + ');
}

/** "today", "tomorrow", "in 5 days", "3 days ago". */
export function relativeDays(target: Date, now: Date): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(target) - startOf(now)) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** expires_at is the exclusive end of a period (midnight). Show the last usable day. */
export function lastDayLabel(expiresAt: string): string {
  const d = new Date(new Date(expiresAt).getTime() - 1);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const PERIOD_LABELS = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannual: 'Every 6 months',
  annual: 'Yearly',
  per_claim: 'Per claim',
} as const;

/** "The Platinum Card® from American Express" → "Platinum Card": short enough for a list row. */
export function shortCardName(productName: string): string {
  return productName.replace(/®|™/g, '').replace(/^The\s+/i, '').replace(/\s+from\s+.+$/i, '').trim();
}
