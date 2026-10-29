import type { SpendCategory } from './checkout';
import type { EarnCategory } from './earnSchema';
import { sameMerchant } from './merchant';
import type { Card, UserCard } from './types';

// Which of your cards earns most for a purchase, from the issuers' own rates (seed/earn_rates.json).
// Value is in "% back": cash cards as stated, points only where the issuer states a cash value. Points
// and miles with no stated value are shown by their rate, never turned into dollars or ranked against cash.
// Rates that depend on things PerkScan can't see (a category you picked, this quarter's rotating ones)
// are tips, not the answer. Pure, so every rule is tested.

export interface EarnRate {
  card_id: string;
  category: EarnCategory;
  rate: number;
  merchants: string[];
  cap: number | null;
  cap_period: 'month' | 'quarter' | 'year' | 'billing_cycle' | null;
  needs: string | null;
  note: string | null;
  source_url: string;
}

export interface CardReward {
  card_id: string;
  kind: 'cash' | 'points' | 'miles';
  /** Only when the issuer states a cash value. */
  cents_per_unit: number | null;
  value_basis: string | null;
}

export interface EarnPick {
  userCardId: string;
  cardId: string;
  rate: EarnRate;
  kind: CardReward['kind'];
  /** % back in cash value; null when points have no stated cash value. */
  value: number | null;
  /** "4x points", "3% back". */
  label: string;
  /** "≈ 2.4% back as a statement credit": only for points with a stated value. */
  valueLabel: string | null;
}

export interface EarnResult {
  /** Your best rate on each card here, best first. */
  picks: EarnPick[];
  /** The card worth most in cash value, or null when none has a known value or two tie. */
  best: EarnPick | null;
  /** Rates that might apply but depend on something PerkScan can't check (your chosen or rotating category). */
  maybe: EarnPick[];
}

const AIRLINE = /airline|airways|\bair\b|delta|united|american air|jetblue|southwest|spirit|frontier|alaska air|caribbean air/i;
const HOTEL = /hotel|resort|inn\b|marriott|hilton|hyatt|ihg|airbnb|vrbo|motel|suites/i;
const RIDES = /\buber\b(?!\s*eats)|lyft|taxi|cab\b/i;
const STREAMING = /netflix|hulu|disney|spotify|youtube|hbo|max\b|peacock|paramount|apple tv|apple music|sling/i;
const ONLINE = /amazon|\.com\b|online/i;

/** The earn categories a purchase falls in, most specific first. */
export function earnCategoriesFor(category: SpendCategory, merchant: string): EarnCategory[] {
  switch (category) {
    case 'dining':
      return ['dining'];
    case 'delivery_rides':
      return RIDES.test(merchant) ? ['transit', 'travel'] : ['dining'];
    case 'groceries':
      return ['groceries', ...(ONLINE.test(merchant) ? (['online_groceries'] as const) : [])];
    case 'gas':
      return ['gas'];
    case 'drugstores':
      return ['drugstores'];
    case 'travel':
      return AIRLINE.test(merchant) ? ['flights', 'travel'] : HOTEL.test(merchant) ? ['hotels', 'travel'] : ['travel'];
    case 'car_rental':
      return ['travel'];
    case 'subscriptions':
      return STREAMING.test(merchant) ? ['streaming'] : [];
    case 'electronics':
    case 'shopping':
      return ONLINE.test(merchant) ? ['online_retail'] : [];
    default:
      return [];
  }
}

const UNIT: Record<CardReward['kind'], string> = { cash: '% back', points: 'x points', miles: 'x miles' };
const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

function pick(userCardId: string, r: EarnRate, reward: CardReward | undefined): EarnPick {
  const kind = reward?.kind ?? 'cash';
  const value = kind === 'cash' ? r.rate : reward?.cents_per_unit ? r.rate * reward.cents_per_unit : null;
  return {
    userCardId,
    cardId: r.card_id,
    rate: r,
    kind,
    value: value === null ? null : Math.round(value * 100) / 100,
    label: kind === 'cash' ? `${r.rate}% back` : `${r.rate}${UNIT[kind]}`,
    valueLabel: kind !== 'cash' && value !== null ? `≈ ${pct(value)} back in cash value` : null,
  };
}

const CONDITIONAL = new Set<EarnCategory>(['choice', 'rotating', 'top_category']);

/** Which card earns most at this store, for this kind of purchase. */
export function bestEarn(
  merchant: string,
  category: SpendCategory,
  d: { userCards: Pick<UserCard, 'id' | 'card_id'>[]; cards: Pick<Card, 'id' | 'kind'>[]; rates: EarnRate[]; rewards: CardReward[] },
): EarnResult {
  const wanted = earnCategoriesFor(category, merchant);
  const picks: EarnPick[] = [];
  const maybe: EarnPick[] = [];
  const seen = new Set<string>();
  for (const uc of d.userCards) {
    const card = d.cards.find((c) => c.id === uc.card_id);
    // Memberships aren't paid with; the same card twice counts once.
    if (!card || card.kind === 'membership' || seen.has(card.id)) continue;
    seen.add(card.id);
    const reward = d.rewards.find((r) => r.card_id === card.id);
    const mine = d.rates.filter((r) => r.card_id === card.id);
    const applies = mine.filter((r) => {
      if (CONDITIONAL.has(r.category)) return false;
      if (r.category === 'merchant' || r.category === 'portal' || r.category === 'portal_hotels') return r.merchants.some((m) => sameMerchant(m, merchant));
      return r.category === 'everything' || wanted.includes(r.category);
    });
    if (!applies.length) continue;
    const scored = applies.map((r) => pick(uc.id, r, reward));
    // A rate that needs nothing beats one that needs Apple Pay when they're worth the same.
    scored.sort((a, b) => (b.value ?? b.rate.rate / 100) - (a.value ?? a.rate.rate / 100) || Number(!!a.rate.needs) - Number(!!b.rate.needs));
    picks.push(scored[0]!);
    for (const r of mine.filter((x) => CONDITIONAL.has(x.category) && x.rate > scored[0]!.rate.rate)) maybe.push(pick(uc.id, r, reward));
  }
  // Known cash value first, biggest first; points with no stated value after, by rate.
  picks.sort((a, b) => (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0) || (b.value ?? 0) - (a.value ?? 0) || b.rate.rate - a.rate.rate);
  const known = picks.filter((p) => p.value !== null);
  const best = known.length && (known.length === 1 || known[0]!.value! > known[1]!.value!) ? known[0]! : null;
  return { picks, best, maybe };
}

/** "up to $50,000 a year" for a capped rate. */
export function capLabel(r: Pick<EarnRate, 'cap' | 'cap_period'>): string | null {
  if (!r.cap || !r.cap_period) return null;
  const per = { month: 'a month', quarter: 'a quarter', year: 'a year', billing_cycle: 'a billing cycle' }[r.cap_period];
  return `on up to $${r.cap.toLocaleString('en-US')} ${per}`;
}

export interface Missed {
  /** Dollars more the right card would have earned, in cash value. */
  total: number;
  count: number;
  /** The purchase where it mattered most. */
  biggest: { merchant: string; date: string; used: EarnPick; best: EarnPick; extra: number } | null;
}

/**
 * What paying with the right card would have earned on past purchases, on top of what the card you used
 * earned. Only purchases matched to one of your cards, only cash values the issuers state, and never a
 * rate that needs something at checkout (Apple Pay, a chosen category): a floor, not a guess.
 */
export function missedEarnings(
  receipts: { merchant: string; total: number | null; currency: string; purchase_date: string | null; purchase_type: string | null; matched_user_card_id: string | null }[],
  d: Parameters<typeof bestEarn>[2],
  categoryOf: (merchant: string, purchaseType: string | null) => SpendCategory,
  since: string,
): Missed {
  const out: Missed = { total: 0, count: 0, biggest: null };
  for (const r of receipts) {
    if (!r.matched_user_card_id || !r.total || r.total <= 0 || r.currency !== 'USD' || !r.purchase_date || r.purchase_date < since) continue;
    const plain = { ...d, rates: d.rates.filter((x) => !x.needs) };
    const res = bestEarn(r.merchant, categoryOf(r.merchant, r.purchase_type), plain);
    const used = res.picks.find((p) => p.userCardId === r.matched_user_card_id);
    const best = res.best;
    if (!used || !best || used.value === null || best.userCardId === used.userCardId) continue;
    const extra = Math.round(((best.value! - used.value) / 100) * r.total * 100) / 100;
    if (extra <= 0) continue;
    out.total = Math.round((out.total + extra) * 100) / 100;
    out.count += 1;
    if (!out.biggest || extra > out.biggest.extra) out.biggest = { merchant: r.merchant, date: r.purchase_date, used, best, extra };
  }
  return out;
}
