import type { Confidence } from './confidence';
import { interestsFor, storeInterests } from './interests';
import type { Opportunity, Receipt } from './types';
import type { IconTone } from './visuals';

// "Deals for you": deals near you that your own inbox won't show you — from store pages PerkScan
// reads, and public promotions other people nearby received. Matched to what you pick plus what
// PerkScan already sees: stores on your receipts, who emails you, what people who shop where you
// do also use, and what you save or hide. Pure, so every rule is tested.

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

export interface InterestInput {
  picked: string[];
  receipts: Pick<Receipt, 'merchant' | 'purchase_type'>[];
  opportunities: Pick<Opportunity, 'merchant' | 'code' | 'type' | 'dedupe_key' | 'value_estimate' | 'source_message_id'>[];
  /** Domains that emailed you, e.g. "courts.co.tt". */
  senderDomains: string[];
}

export interface InterestProfile {
  picked: Set<string>;
  /** How often each kind of spending shows up in your receipts and alerts. */
  inferred: Map<Interest, number>;
  /** Stores on your receipts and card alerts. */
  shops: Set<string>;
  /** Stores that email you: their deals reach you anyway. */
  follows: Set<string>;
  /** A readable name for each store key. */
  names: Map<string, string>;
  /** Already in Money: codes, and "store|amount" pairs. Deals matching these aren't shown again. */
  inMoney: { codes: Set<string>; offers: Set<string>; savedDeals: Set<string> };
}

export function interestProfile(d: InterestInput): InterestProfile {
  const inferred = new Map<Interest, number>();
  const names = new Map<string, string>();
  const shops = new Set<string>();
  const follows = new Set<string>();
  const add = (set: Set<string>, name: string | null | undefined, key = name ? storeKey(name) : '') => {
    if (!key || key.length < 3) return;
    set.add(key);
    if (name && !names.has(key)) names.set(key, name);
  };
  for (const r of d.receipts) {
    // What the store is known for ("Planet Fitness" -> fitness) beats the kind of purchase ("subscription").
    // A store known for several things (Courts: electronics and home) follows what was bought.
    const known: Interest[] = storeInterests(r.merchant).filter((i) => i !== 'shopping');
    const bought = r.purchase_type ? PURCHASE_INTEREST[r.purchase_type] : undefined;
    const kinds = bought && (known.includes(bought) || !known.length) ? [bought] : known;
    for (const i of kinds) inferred.set(i, (inferred.get(i) ?? 0) + 1);
    add(shops, r.merchant);
  }
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
  for (const [k, n] of [...names]) if (!n) names.delete(k);
  return { picked: new Set(d.picked), inferred, shops, follows, names, inMoney: { codes, offers, savedDeals } };
}

/** The first of the deal's store names found in a set (exact, or one starting with the other). */
export function matchStore(deal: Pick<Deal, 'merchant' | 'merchant_keys'>, stores: Iterable<string>): string | null {
  const keys = [...deal.merchant_keys, storeKey(deal.merchant)].filter((k) => k.length >= 3);
  for (const s of stores) {
    if (keys.some((k) => s === k || (s.length >= 4 && k.length >= 4 && (s.startsWith(k) || k.startsWith(s))))) return s;
  }
  return null;
}

export interface StoreStat {
  store_key: string;
  people: number;
}
export interface StorePair {
  store_a: string;
  store_b: string;
  people: number;
}

/**
 * "People like you": for each store you don't use, the store of yours whose customers use it most,
 * and what share of them do. Built from counts of 5+ people who opted in — never individuals.
 */
export function peopleLikeYou(p: InterestProfile, stats: StoreStat[], pairs: StorePair[]): Map<string, { via: string; share: number }> {
  const mine = new Set([...p.shops, ...p.follows]);
  const total = new Map(stats.map((s) => [s.store_key, s.people]));
  const out = new Map<string, { via: string; share: number }>();
  for (const x of pairs) {
    if (!mine.has(x.store_a) || mine.has(x.store_b)) continue;
    const n = total.get(x.store_a);
    if (!n) continue;
    const share = Math.min(1, x.people / n);
    if ((out.get(x.store_b)?.share ?? 0) < share) out.set(x.store_b, { via: p.names.get(x.store_a) ?? x.store_a, share });
  }
  return out;
}

export interface DealsFor {
  country: string | null;
  region?: string | null;
  today: string; // YYYY-MM-DD
  profile: InterestProfile;
  feedback: DealFeedback[];
  /** From peopleLikeYou(). */
  likeYou?: Map<string, { via: string; share: number }>;
}

export interface RankedDeal {
  deal: Deal;
  /** What it's about, most certain first: its category, what the store is known for, its wording. */
  tags: Interest[];
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
/** Below this share, "people who use X also use Y" is too weak to mention. */
const LIKE_YOU_MIN_SHARE = 0.2;

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
 * Deals for you: what your own inbox won't show you. Available where you live, not ended, not
 * hidden by you, and not already in your Money. Stores that already email you are lowered (you'd
 * see their deals anyway); what's raised is a store you shop at that doesn't email you, an interest
 * you picked, a store popular with people who shop where you do, and what you spend on — then
 * value, urgency, confidence and popularity. `popular` holds the best of the rest.
 */
export function rankDeals(deals: Deal[], who: DealsFor): { forYou: RankedDeal[]; popular: RankedDeal[] } {
  const hiddenIds = new Set(who.feedback.filter((f) => f.action !== 'saved').map((f) => f.deal_id));
  const dismissedStores = new Set(
    deals.filter((d) => who.feedback.some((f) => f.deal_id === d.id && f.action === 'dismissed')).map((d) => storeKey(d.merchant)),
  );
  const { picked, inferred, shops, follows, inMoney } = who.profile;
  const forYou: RankedDeal[] = [];
  const popular: RankedDeal[] = [];
  for (const d of deals) {
    if (!who.country || !d.countries.includes(who.country)) continue;
    if (d.regions.length && (!who.region || !d.regions.includes(who.region))) continue;
    if (d.ends_on && d.ends_on < who.today) continue;
    if (d.starts_on && d.starts_on > addDays(who.today, 14)) continue;
    if (hiddenIds.has(d.id)) continue;
    // Already in Money from your own email: not new to you.
    const saved = inMoney.savedDeals.has(d.id);
    if (!saved && ((d.code && inMoney.codes.has(d.code.toUpperCase())) || (d.amount !== null && inMoney.offers.has(`${storeKey(d.merchant)}|${d.amount}`)))) continue;

    const followed = !!matchStore(d, follows);
    const shop = followed ? null : matchStore(d, shops);
    const like = [...d.merchant_keys, storeKey(d.merchant)].map((k) => who.likeYou?.get(k)).filter((x) => !!x && x.share >= LIKE_YOU_MIN_SHARE).sort((a, b) => b!.share - a!.share)[0];
    const tags = interestsFor({ category: d.category, merchant: d.merchant, title: d.title, summary: d.summary });
    const pickedTag = tags.find((t) => picked.has(t));
    const spentTag = [...tags].sort((a, b) => (inferred.get(b) ?? 0) - (inferred.get(a) ?? 0))[0];
    const spend = spentTag ? inferred.get(spentTag) ?? 0 : 0;

    let match = 0;
    let why: string | null = null;
    if (shop) {
      match += 30;
      why = `You shop at ${d.merchant}`;
    }
    if (pickedTag) {
      match += 25;
      why ??= `Matches ${interestLabel(pickedTag)}`;
    }
    if (like) {
      match += 10 + Math.round(20 * like.share);
      why ??= `Popular with people who use ${like.via}`;
    }
    if (spend > 0) {
      match += Math.min(15, spend * 5);
      why ??= `You spend on ${interestLabel(spentTag!).toLowerCase()}`;
    }
    let penalty = 0;
    if (followed) penalty += 15;
    if (dismissedStores.has(storeKey(d.merchant))) penalty += 20;

    const ranked = { deal: d, tags, score: match - penalty + baseScore(d, who.today), why };
    if (match > 0 && match > penalty) forYou.push(ranked);
    // A store that already emails you, with nothing else going for it, isn't news.
    else if (!followed) popular.push({ ...ranked, why: null });
  }
  const order = (a: RankedDeal, b: RankedDeal) => b.score - a.score || (a.deal.ends_on ?? '9999').localeCompare(b.deal.ends_on ?? '9999');
  return { forYou: forYou.sort(order), popular: popular.sort(order) };
}

export interface InterestGroup {
  interest: Interest;
  deals: RankedDeal[];
}

/**
 * Deals for you, under each interest you picked (in your order). A deal about two of them shows in
 * both. `rest` is what's for you for another reason (a store you shop at, people like you).
 */
export function groupByInterest(forYou: RankedDeal[], picked: string[]): { groups: InterestGroup[]; rest: RankedDeal[] } {
  const groups = picked
    .filter((i): i is Interest => INTERESTS.some((x) => x.id === i))
    .map((interest) => ({ interest, deals: forYou.filter((d) => d.tags.includes(interest)) }));
  const rest = forYou.filter((d) => !d.tags.some((t) => picked.includes(t)));
  return { groups, rest };
}

/** "TT$300 off", "20% off", "Code SAVE10" — the deal's headline number, only if it was stated. */
export function dealValue(d: Pick<Deal, 'amount' | 'percent_off'>, format: (amount: number) => string): string | null {
  if (d.amount !== null && d.amount > 0) return `${format(d.amount)} off`;
  if (d.percent_off !== null) return `${Number(d.percent_off)}% off`;
  return null;
}

/** Interests worth suggesting when someone hasn't picked any: the ones their spending shows. */
export function suggestedInterests(p: InterestProfile, max = 4): Interest[] {
  return [...p.inferred.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([i]) => i);
}
