import { storeKey } from './deals';
import { serviceOf, type Service } from './subscriptions';
import type { Receipt } from './types';

// "Your subscriptions": what your receipts show you pay for again and again, what it costs a year,
// and where a student price would cost less. Only prices checked on the provider's own page are
// used for savings; nothing is estimated. Pure, so every rule is tested.

export interface StudentPrice {
  /** The student offer in the catalog (student_discounts.json). */
  offerId: string;
  regularMonthly: number;
  studentMonthly: number;
  currency: 'USD';
  sourceUrl: string;
  checked: string;
}

/** US prices read on the provider's own pages. Services not listed here get no saving shown. */
export const STUDENT_PRICES: Record<string, StudentPrice> = {
  spotify: { offerId: 'spotify_premium_student_us', regularMonthly: 12.99, studentMonthly: 6.99, currency: 'USD', sourceUrl: 'https://www.spotify.com/us/premium/', checked: '2026-10-27' },
  apple_music: { offerId: 'apple_music_student', regularMonthly: 11.99, studentMonthly: 6.99, currency: 'USD', sourceUrl: 'https://www.apple.com/apple-music/', checked: '2026-10-27' },
  amazon_prime: { offerId: 'amazon_prime_student', regularMonthly: 14.99, studentMonthly: 7.49, currency: 'USD', sourceUrl: 'https://www.amazon.com/amazonprime/prime-student', checked: '2026-10-27' },
};

export type Period = 'monthly' | 'yearly';

export interface Subscription {
  key: string;
  name: string;
  /** The latest charge. */
  amount: number;
  currency: string;
  period: Period;
  yearly: number;
  lastCharged: string;
  charges: number;
  service: Service | null;
  /** A cheaper student price for this exact service, with what it saves a year. */
  student: (StudentPrice & { savesYearly: number }) | null;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Subscriptions from receipts in the last 13 months: the same store charging the same amount (within
 * 2%) about every month or every year — or one charge from a service known to be a subscription.
 * Food orders and shopping vary too much to look like one.
 */
export function mySubscriptions(
  receipts: Pick<Receipt, 'merchant' | 'total' | 'currency' | 'purchase_date' | 'purchase_type'>[],
  now: Date,
  isStudent: boolean,
): Subscription[] {
  const since = new Date(now.getTime() - 395 * DAY).toISOString().slice(0, 10);
  const byStore = new Map<string, typeof receipts>();
  for (const r of receipts) {
    if (r.total === null || r.total <= 0 || !r.purchase_date || r.purchase_date < since) continue;
    const k = `${serviceOf(r.merchant)?.key ?? storeKey(r.merchant)}|${r.currency}`;
    byStore.set(k, [...(byStore.get(k) ?? []), r]);
  }

  const out: Subscription[] = [];
  for (const [key, list] of byStore) {
    const sorted = [...list].sort((a, b) => a.purchase_date!.localeCompare(b.purchase_date!));
    const last = sorted[sorted.length - 1]!;
    const service = serviceOf(last.merchant);
    // Charges of the latest amount (a price change keeps the newer price).
    const same = sorted.filter((r) => Math.abs(r.total! - last.total!) <= last.total! * 0.02);
    let period: Period | null = null;
    if (same.length >= 2) {
      const gap = median(same.slice(1).map((r, i) => days(same[i]!.purchase_date!, r.purchase_date!)));
      period = gap >= 26 && gap <= 35 ? 'monthly' : gap >= 350 && gap <= 380 ? 'yearly' : null;
    } else if (service && last.purchase_type === 'subscription') {
      period = 'monthly'; // one charge from a known subscription service: monthly is how these bill by default
    }
    if (!period) continue;
    const yearly = Math.round(last.total! * (period === 'monthly' ? 12 : 1) * 100) / 100;
    const sp = service ? STUDENT_PRICES[service.key] : undefined;
    const student =
      sp && isStudent && last.currency === sp.currency && period === 'monthly' && last.total! > sp.studentMonthly + 0.5
        ? { ...sp, savesYearly: Math.round((last.total! - sp.studentMonthly) * 12 * 100) / 100 }
        : null;
    out.push({ key, name: service?.name ?? last.merchant, amount: last.total!, currency: last.currency, period, yearly, lastCharged: last.purchase_date!, charges: same.length, service: service ?? null, student });
  }
  return out.sort((a, b) => b.yearly - a.yearly);
}
