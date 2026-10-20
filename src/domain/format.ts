/** "$1,234" for whole dollars, "$12.50" otherwise. Avoids Intl so it behaves the same on every engine. */
export function formatMoney(n: number, opts: { cents?: boolean } = {}): string {
  const negative = n < 0;
  const abs = Math.abs(n);
  const showCents = opts.cents ?? !Number.isInteger(Math.round(abs * 100) / 100);
  const fixed = abs.toFixed(showCents ? 2 : 0);
  const [whole = '0', frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}${frac ? `.${frac}` : ''}`;
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
