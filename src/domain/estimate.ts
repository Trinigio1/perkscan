import { addToBag, type MoneyBag } from './format';
import { matchStore, storeKey, type RankedDeal } from './deals';
import type { Opportunity, Receipt } from './types';

// Estimates for what has no stated dollar value: a percent-off code is worth that percent of what
// you usually spend at that store, judged from your own receipts there. Always shown as "≈", never
// added to "Ready to use" (that stays money you definitely have). No receipts there, no estimate.
// Pure, so every rule is tested.

const DAY = 86_400_000;

/** "20% off sitewide", "Extra 15% Off" -> 20 / 15. Only a plain whole-number percent "off". */
export function percentOff(text: string | null | undefined): number | null {
  const m = /\b(\d{1,2})\s?%\s*off\b/i.exec(text ?? '');
  const n = m ? Number(m[1]) : NaN;
  return n > 0 && n <= 90 ? n : null;
}

export interface UsualSpend {
  /** The middle order total (median), so one big purchase doesn't skew it. */
  amount: number;
  currency: string;
  orders: number;
}

/** What you usually spend at a store: the median of your orders there in the last year, in one currency. */
export function usualSpend(
  merchant: string,
  receipts: Pick<Receipt, 'merchant' | 'total' | 'currency' | 'purchase_date'>[],
  now: Date,
  currency?: string | null,
): UsualSpend | null {
  const since = new Date(now.getTime() - 365 * DAY).toISOString().slice(0, 10);
  const keys = { merchant, merchant_keys: [storeKey(merchant)] };
  const totals = receipts.filter(
    (r) => r.total !== null && r.total > 0 && (!r.purchase_date || r.purchase_date >= since) && (!currency || r.currency === currency) && !!matchStore(keys, [storeKey(r.merchant)]),
  );
  if (!totals.length) return null;
  // One currency only: the one most of your orders there were in.
  const cur = currency ?? [...totals.reduce((m, r) => m.set(r.currency, (m.get(r.currency) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]![0];
  const amounts = totals.filter((r) => r.currency === cur).map((r) => r.total!).sort((a, b) => a - b);
  const mid = Math.floor(amounts.length / 2);
  const median = amounts.length % 2 ? amounts[mid]! : (amounts[mid - 1]! + amounts[mid]!) / 2;
  return { amount: Math.round(median * 100) / 100, currency: cur, orders: amounts.length };
}

export interface Estimate {
  value: number;
  currency: string;
  percent: number;
  basis: UsualSpend;
}

/**
 * A percent-off amount worth estimating: percent of your usual spend there. Nothing when the offer
 * already has a value, the store isn't on your receipts, or its minimum spend is above what you
 * usually spend (you'd have to spend more than usual to get it).
 */
export function estimateDiscount(
  percent: number | null,
  merchant: string | null | undefined,
  minSpend: number | null | undefined,
  receipts: Pick<Receipt, 'merchant' | 'total' | 'currency' | 'purchase_date'>[],
  now: Date,
  currency?: string | null,
): Estimate | null {
  if (!percent || !merchant) return null;
  const basis = usualSpend(merchant, receipts, now, currency);
  if (!basis || (minSpend && minSpend > basis.amount)) return null;
  const value = Math.round(basis.amount * percent) / 100;
  return value >= 0.5 ? { value: Math.round(value * 100) / 100, currency: basis.currency, percent, basis } : null;
}

/** An email offer's estimate, if it's an open percent-off code or promo with no stated value. */
export function offerEstimate(o: Opportunity, receipts: Receipt[], now: Date): Estimate | null {
  if (o.type !== 'promo' || o.value_estimate !== null || o.status !== 'open') return null;
  if (o.expires_at && new Date(o.expires_at) <= now) return null;
  const percent = o.percent_off ?? percentOff(`${o.title} ${o.description ?? ''}`);
  return estimateDiscount(percent, o.merchant, o.min_spend, receipts, now, o.currency);
}

export interface DiscountSummary {
  /** Estimated worth of percent-off codes at stores you buy from, per currency. */
  estimated: MoneyBag;
  estimatedCount: number;
  /** Other open discounts with no dollar value: percent off where you haven't shopped, free items. */
  otherCount: number;
  /** The biggest percent among them, for "up to 40% off". */
  bestPercent: number | null;
}

/** "≈ $46 more in discounts · 6 codes": open discounts from your email that aren't in Ready to use. */
export function discountSummary(opportunities: Opportunity[], receipts: Receipt[], now: Date): DiscountSummary {
  const out: DiscountSummary = { estimated: {}, estimatedCount: 0, otherCount: 0, bestPercent: null };
  for (const o of opportunities) {
    if (o.type !== 'promo' || o.value_estimate !== null || o.status !== 'open') continue;
    if (o.expires_at && new Date(o.expires_at) <= now) continue;
    const percent = o.percent_off ?? percentOff(`${o.title} ${o.description ?? ''}`);
    if (percent) out.bestPercent = Math.max(out.bestPercent ?? 0, percent);
    const e = offerEstimate(o, receipts, now);
    if (e) {
      out.estimated = addToBag(out.estimated, e.currency, e.value);
      out.estimatedCount += 1;
    } else out.otherCount += 1;
  }
  return out;
}

export interface DealsWorth {
  /** Stated dollar amounts plus percent-off estimates, per currency. */
  worth: MoneyBag;
  /** Deals for you counted in it. */
  counted: number;
  /** All deals for you. */
  total: number;
}

/**
 * What the deals matched to you are worth: a stated amount off (if its minimum spend isn't above
 * what you usually spend there), or a percent of your usual spend there. Deals with neither are
 * counted in `total` but add nothing.
 */
export function dealsWorth(forYou: RankedDeal[], receipts: Receipt[], now: Date, homeCurrency: string): DealsWorth {
  const out: DealsWorth = { worth: {}, counted: 0, total: forYou.length };
  for (const { deal: d } of forYou) {
    let value: number | null = null;
    let currency = d.currency ?? homeCurrency;
    if (d.amount !== null && d.amount > 0) {
      const usual = d.min_spend ? usualSpend(d.merchant, receipts, now, currency) : null;
      if (!d.min_spend || (usual && usual.amount >= d.min_spend)) value = d.amount;
    } else if (d.percent_off) {
      const e = estimateDiscount(Number(d.percent_off), d.merchant, d.min_spend, receipts, now, d.currency);
      if (e) {
        value = e.value;
        currency = e.currency;
      }
    }
    if (value !== null) {
      out.worth = addToBag(out.worth, currency, value);
      out.counted += 1;
    }
  }
  return out;
}
