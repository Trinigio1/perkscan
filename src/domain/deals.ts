import type { Confidence } from './confidence';
import type { Opportunity, Receipt } from './types';
import type { IconTone } from './visuals';

// Offers at your stores: promotions on the official pages of stores you already shop at or hear
// from, that aren't already in your Money. Not a coupon feed: a store you don't use never shows.
// Pure, so every rule is tested.

export const INTERESTS = [
  { id: 'groceries', label: 'Groceries', icon: 'cart', tone: 'green' },
  { id: 'dining', label: 'Eating out', icon: 'restaurant', tone: 'orange' },
  { id: 'delivery', label: 'Food delivery', icon: 'bicycle', tone: 'orange' },
  { id: 'electronics', label: 'Electronics', icon: 'laptop', tone: 'blue' },
  { id: 'fashion', label: 'Clothes & shoes', icon: 'shirt', tone: 'pink' },
  { id: 'home', label: 'Home & appliances', icon: 'home', tone: 'teal' },
  { id: 'travel', label: 'Travel', icon: 'airplane', tone: 'blue' },
  { id: 'beauty', label: 'Beauty', icon: 'sparkles', tone: 'pink' },
  { id: 'fitness', label: 'Fitness', icon: 'barbell', tone: 'green' },
  { id: 'entertainment', label: 'Movies & fun', icon: 'film', tone: 'purple' },
  { id: 'fuel', label: 'Gas', icon: 'car', tone: 'gray' },
  { id: 'kids', label: 'Kids', icon: 'happy', tone: 'orange' },
  { id: 'pets', label: 'Pets', icon: 'paw', tone: 'teal' },
  { id: 'education', label: 'Books & school', icon: 'book', tone: 'purple' },
  { id: 'shopping', label: 'Everything else', icon: 'bag-handle', tone: 'gray' },
] as const satisfies readonly { id: string; label: string; icon: string; tone: IconTone }[];

export type Interest = (typeof INTERESTS)[number]['id'];
export const interestLabel = (id: string) => INTERESTS.find((i) => i.id === id)?.label ?? id;

export interface Deal {
  id: string;
  source: 'official' | 'shared' | 'affiliate';
  merchant: string;
  merchant_keys: string[];
  title: string;
  summary: string | null;
  category: Interest;
  amount: number | null;
  percent_off: number | null;
  currency: string | null;
  code: string | null;
  min_spend: number | null;
  countries: string[];
  regions: string[];
  starts_on: string | null;
  ends_on: string | null;
  url: string | null;
  evidence: string | null;
  confidence: Confidence;
  seen_by: number;
  saves: number;
}

export interface DealFeedback {
  deal_id: string;
  action: 'saved' | 'dismissed' | 'didnt_work';
}

/** "COURTS (TRINIDAD) LTD" -> "courts". The same rule as public.store_key in the database. */
export const storeKey = (m: string) =>
  m.toLowerCase().replace(/\b(ltd|limited|inc|llc|corp|company|the|trinidad|tobago|jamaica|barbados|usa)\b/g, ' ').replace(/[^a-z0-9]/g, '').slice(0, 60);

/** "email.courts.co.tt" -> "courts", "mail.target.com" -> "target". Same rule as public.domain_store_key. */
export function domainStoreKey(domain: string): string | null {
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2 || /\.(gov|edu|mil)(\.[a-z]{2})?$/.test(domain.toLowerCase())) return null;
  const cc = parts.length >= 3 && parts[parts.length - 1]!.length === 2 && ['co', 'com', 'net', 'org', 'ac'].includes(parts[parts.length - 2]!);
  const k = storeKey(parts[parts.length - (cc ? 3 : 2)]!);
  return k.length >= 3 ? k : null;
}

/** Offers that arrive by email: if a store sends you these, you'd see its deals anyway. */
const EMAILED = new Set(['promo', 'gift_card', 'store_credit', 'points', 'free_trial']);

export interface StoreInput {
  receipts: Pick<Receipt, 'merchant'>[];
  opportunities: Pick<Opportunity, 'merchant' | 'code' | 'type' | 'dedupe_key' | 'value_estimate' | 'source_message_id'>[];
  /** Domains that emailed you, e.g. "courts.co.tt". */
  senderDomains: string[];
}

export interface StoreProfile {
  /** Stores on your receipts and card alerts. */
  shops: Set<string>;
  /** Stores that email you. */
  follows: Set<string>;
  /** A readable name for each store key. */
  names: Map<string, string>;
  /** Already in Money: codes, and "store|amount" pairs. Offers matching these aren't shown again. */
  inMoney: { codes: Set<string>; offers: Set<string>; savedDeals: Set<string> };
}

/** The stores you use, from your receipts and who emails you, and what's already in your Money. */
export function storeProfile(d: StoreInput): StoreProfile {
  const names = new Map<string, string>();
  const shops = new Set<string>();
  const follows = new Set<string>();
  const add = (set: Set<string>, name: string | null | undefined, key = name ? storeKey(name) : '') => {
    if (!key || key.length < 3) return;
    set.add(key);
    if (name && !names.has(key)) names.set(key, name);
  };
  for (const r of d.receipts) add(shops, r.merchant);
  for (const dom of d.senderDomains) {
    const k = domainStoreKey(dom);
    if (k) add(follows, null, k);
  }
  const codes = new Set<string>();
  const offers = new Set<string>();
  const savedDeals = new Set<string>();
  for (const o of d.opportunities) {
    const saved = /^deal:[a-z]+:(.+)$/.exec(o.dedupe_key ?? '');
    if (saved) {
      savedDeals.add(saved[1]!);
      continue;
    }
    if (o.code) codes.add(o.code.toUpperCase());
    if (o.merchant && o.value_estimate !== null) offers.add(`${storeKey(o.merchant)}|${Number(o.value_estimate)}`);
    if (o.source_message_id && EMAILED.has(o.type)) add(follows, o.merchant);
  }
  return { shops, follows, names, inMoney: { codes, offers, savedDeals } };
}

/** The first of the deal's store names found in a set (exact, or one starting with the other). */
export function matchStore(deal: Pick<Deal, 'merchant' | 'merchant_keys'>, stores: Iterable<string>): string | null {
  const keys = [...deal.merchant_keys, storeKey(deal.merchant)].filter((k) => k.length >= 3);
  for (const s of stores) {
    if (keys.some((k) => s === k || (s.length >= 4 && k.length >= 4 && (s.startsWith(k) || k.startsWith(s))))) return s;
  }
  return null;
}

export interface OffersFor {
  country: string | null;
  region?: string | null;
  today: string; // YYYY-MM-DD
  stores: StoreProfile;
  feedback: DealFeedback[];
}

export interface RankedDeal {
  deal: Deal;
  score: number;
  /** One short line: why you're seeing it ("You shop at Courts"). */
  why: string;
}

const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
export const daysUntil = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);

const CONFIDENCE_POINTS: Record<Confidence, number> = { confirmed: 6, likely: 3, check: 0 };

/** How much an offer is worth showing: value, urgency and how sure. */
function baseScore(d: Deal, today: string): number {
  // Amounts are in different currencies, so value is judged on a gentle curve, not compared exactly.
  const value = Math.max(d.amount !== null ? Math.min(15, Math.log10(Math.max(d.amount, 1)) * 6) : 0, d.percent_off !== null ? Math.min(15, d.percent_off / 3) : 0);
  const left = d.ends_on ? daysUntil(today, d.ends_on) : null;
  const urgency = left === null ? 0 : left <= 3 ? 8 : left <= 7 ? 5 : 0;
  return value + urgency + CONFIDENCE_POINTS[d.confidence];
}

/**
 * Offers at your stores: available where you live, not ended or weeks away, not hidden by you,
 * not already in your Money, and only at a store you shop at or that emails you. Stores you've
 * bought from come first, then value, urgency and confidence.
 */
export function storeOffers(deals: Deal[], who: OffersFor): RankedDeal[] {
  const hiddenIds = new Set(who.feedback.filter((f) => f.action !== 'saved').map((f) => f.deal_id));
  const { shops, follows, inMoney } = who.stores;
  const out: RankedDeal[] = [];
  for (const d of deals) {
    if (d.source === 'shared') continue;
    if (!who.country || !d.countries.includes(who.country)) continue;
    if (d.regions.length && (!who.region || !d.regions.includes(who.region))) continue;
    if (d.ends_on && d.ends_on < who.today) continue;
    if (d.starts_on && d.starts_on > addDays(who.today, 14)) continue;
    if (hiddenIds.has(d.id)) continue;
    // Already in Money from your own email: not new to you.
    const saved = inMoney.savedDeals.has(d.id);
    if (!saved && ((d.code && inMoney.codes.has(d.code.toUpperCase())) || (d.amount !== null && inMoney.offers.has(`${storeKey(d.merchant)}|${d.amount}`)))) continue;

    const shop = matchStore(d, shops);
    const follow = shop ? null : matchStore(d, follows);
    if (!shop && !follow) continue;
    out.push({ deal: d, score: (shop ? 10 : 0) + baseScore(d, who.today), why: shop ? `You shop at ${d.merchant}` : `${d.merchant} emails you` });
  }
  return out.sort((a, b) => b.score - a.score || (a.deal.ends_on ?? '9999').localeCompare(b.deal.ends_on ?? '9999'));
}

/** "TT$300 off", "20% off", "Code SAVE10" — the deal's headline number, only if it was stated. */
export function dealValue(d: Pick<Deal, 'amount' | 'percent_off'>, format: (amount: number) => string): string | null {
  if (d.amount !== null && d.amount > 0) return `${format(d.amount)} off`;
  if (d.percent_off !== null) return `${Number(d.percent_off)}% off`;
  return null;
}

