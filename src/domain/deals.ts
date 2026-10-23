import type { Confidence } from './confidence';
import type { Opportunity, Receipt } from './types';
import type { IconTone } from './visuals';

// "Deals for you": store deals near you, matched to what you're into. Interests come from what
// you pick plus what PerkScan already sees — stores on your receipts and card alerts, who emails
// you, and what you save or hide. Pure, so every rule is tested.

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

/** What a receipt says you spend on. */
const PURCHASE_INTEREST: Record<string, Interest> = {
  electronics: 'electronics', appliance: 'home', phone: 'electronics', clothing: 'fashion', other_goods: 'shopping',
  flight: 'travel', car_rental: 'travel', hotel: 'travel', travel_other: 'travel',
  food_delivery: 'delivery', restaurant: 'dining', groceries: 'groceries', subscription: 'entertainment',
};

export interface InterestInput {
  picked: string[];
  receipts: Pick<Receipt, 'merchant' | 'purchase_type'>[];
  opportunities: Pick<Opportunity, 'merchant'>[];
  /** Domains that emailed you, e.g. "email.courts.co.tt". */
  senderDomains: string[];
}

export interface InterestProfile {
  picked: Set<string>;
  /** How often each kind of spending shows up in your receipts and alerts. */
  inferred: Map<Interest, number>;
  /** Stores you deal with, squashed ("pricesmart"), from receipts, offers and sender domains. */
  stores: Set<string>;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function interestProfile(d: InterestInput): InterestProfile {
  const inferred = new Map<Interest, number>();
  for (const r of d.receipts) {
    const i = r.purchase_type ? PURCHASE_INTEREST[r.purchase_type] : undefined;
    if (i) inferred.set(i, (inferred.get(i) ?? 0) + 1);
  }
  const stores = new Set<string>();
  for (const m of [...d.receipts.map((r) => r.merchant), ...d.opportunities.map((o) => o.merchant ?? '')]) {
    const k = squash(m);
    if (k.length >= 3) stores.add(k);
  }
  // Domain labels: "email.courts.co.tt" -> "courts". Short and generic labels are skipped.
  const GENERIC = new Set(['email', 'mail', 'news', 'info', 'shop', 'store', 'online', 'www', 'com', 'net', 'org', 'reply', 'noreply', 'send', 'promo', 'deals', 'mailer']);
  for (const dom of d.senderDomains) {
    for (const label of dom.toLowerCase().split('.')) {
      const k = squash(label);
      if (k.length >= 4 && !GENERIC.has(k)) stores.add(k);
    }
  }
  return { picked: new Set(d.picked), inferred, stores };
}

/** Whether you deal with this deal's store: a store name you use contains one of its names, or vice versa. */
export function shopsAt(deal: Pick<Deal, 'merchant' | 'merchant_keys'>, stores: Set<string>): boolean {
  const keys = [...deal.merchant_keys, deal.merchant].map(squash).filter((k) => k.length >= 4);
  for (const s of stores) {
    if (keys.some((k) => s === k || (s.length >= 4 && (s.startsWith(k) || k.startsWith(s))))) return true;
  }
  return false;
}

export interface DealsFor {
  country: string | null;
  region?: string | null;
  today: string; // YYYY-MM-DD
  profile: InterestProfile;
  feedback: DealFeedback[];
}

export interface RankedDeal {
  deal: Deal;
  score: number;
  /** One short line: why you're seeing it. Null for popular deals that don't match you. */
  why: string | null;
}

const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const daysUntil = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);

const CONFIDENCE_POINTS: Record<Confidence, number> = { confirmed: 6, likely: 3, check: 0 };

/** How much a deal is worth to show, ignoring who you are: value, urgency, how sure, how popular. */
function baseScore(d: Deal, today: string): number {
  // Amounts are in different currencies, so value is judged on a gentle curve, not compared exactly.
  const value = Math.max(d.amount !== null ? Math.min(15, Math.log10(Math.max(d.amount, 1)) * 6) : 0, d.percent_off !== null ? Math.min(15, d.percent_off / 3) : 0);
  const left = d.ends_on ? daysUntil(today, d.ends_on) : null;
  const urgency = left === null ? 0 : left <= 3 ? 8 : left <= 7 ? 5 : 0;
  const popular = Math.min(6, d.saves + d.seen_by / 2);
  return value + urgency + CONFIDENCE_POINTS[d.confidence] + popular;
}

/**
 * Deals for you: available where you live, not ended, not hidden by you — ranked by how well they
 * match you first (a store you use, an interest you picked, what you spend on), then value,
 * urgency, confidence and popularity. `popular` holds the best of the rest, for when few match.
 */
export function rankDeals(deals: Deal[], who: DealsFor): { forYou: RankedDeal[]; popular: RankedDeal[] } {
  const hiddenIds = new Set(who.feedback.filter((f) => f.action !== 'saved').map((f) => f.deal_id));
  const dismissedStores = new Set(
    deals.filter((d) => who.feedback.some((f) => f.deal_id === d.id && f.action === 'dismissed')).map((d) => squash(d.merchant)),
  );
  const forYou: RankedDeal[] = [];
  const popular: RankedDeal[] = [];
  for (const d of deals) {
    if (!who.country || !d.countries.includes(who.country)) continue;
    if (d.regions.length && (!who.region || !d.regions.includes(who.region))) continue;
    if (d.ends_on && d.ends_on < who.today) continue;
    if (d.starts_on && d.starts_on > addDays(who.today, 14)) continue;
    if (hiddenIds.has(d.id)) continue;

    const { picked, inferred, stores } = who.profile;
    const shop = shopsAt(d, stores);
    const spend = inferred.get(d.category) ?? 0;
    let match = 0;
    let why: string | null = null;
    if (shop) {
      match += 40;
      why = `You shop at ${d.merchant}`;
    }
    if (picked.has(d.category)) {
      match += 25;
      why ??= `You picked ${interestLabel(d.category)}`;
    }
    if (spend > 0) {
      match += Math.min(15, spend * 5);
      why ??= `You spend on ${interestLabel(d.category).toLowerCase()}`;
    }
    if (dismissedStores.has(squash(d.merchant))) match -= 20;

    const ranked = { deal: d, score: match + baseScore(d, who.today), why };
    if (match > 0) forYou.push(ranked);
    else popular.push({ ...ranked, why: null });
  }
  const order = (a: RankedDeal, b: RankedDeal) => b.score - a.score || (a.deal.ends_on ?? '9999').localeCompare(b.deal.ends_on ?? '9999');
  return { forYou: forYou.sort(order), popular: popular.sort(order) };
}

/** "TT$300 off", "20% off", "Code SAVE10" — the deal's headline number, only if it was stated. */
export function dealValue(d: Pick<Deal, 'amount' | 'percent_off'>, format: (amount: number) => string): string | null {
  if (d.amount !== null) return `${format(d.amount)} off`;
  if (d.percent_off !== null) return `${Number(d.percent_off)}% off`;
  return null;
}

/** Interests worth suggesting when someone hasn't picked any: the ones their spending shows. */
export function suggestedInterests(p: InterestProfile, max = 4): Interest[] {
  return [...p.inferred.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([i]) => i);
}
