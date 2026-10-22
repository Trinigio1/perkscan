import { addToBag, type MoneyBag } from './format';
import { remainingValue } from './score';
import type { Opportunity } from './types';

// One list for everything you can use: card credits, codes, gift cards, trials, protections.

export type MoneyView = 'open' | 'used' | 'missed';
export type MoneyKind = 'credits' | 'codes' | 'gift_cards' | 'points' | 'refunds' | 'benefits' | 'returns' | 'protections' | 'other';

export const KIND_LABELS: Record<MoneyKind, string> = {
  credits: 'Card credits',
  codes: 'Codes',
  gift_cards: 'Gift cards',
  points: 'Points & miles',
  refunds: 'Refunds',
  benefits: 'Benefits',
  returns: 'Returns & trials',
  protections: 'Protections',
  other: 'Settlements',
};
const KIND_ORDER: MoneyKind[] = ['credits', 'codes', 'gift_cards', 'points', 'refunds', 'benefits', 'returns', 'protections', 'other'];

export function kindOf(o: Pick<Opportunity, 'type'>): MoneyKind {
  switch (o.type) {
    case 'card_credit':
      return 'credits';
    case 'promo':
      return 'codes';
    case 'price_drop':
      return 'returns';
    case 'gift_card':
    case 'store_credit':
      return 'gift_cards';
    case 'points':
      return 'points';
    case 'refund':
      return 'refunds';
    case 'benefit':
      return 'benefits';
    case 'free_trial':
    case 'return_window':
      return 'returns';
    case 'protection':
      return 'protections';
    default:
      return 'other';
  }
}

const WEEK_MS = 7 * 86_400_000;
const t = (o: Opportunity) => (o.expires_at ? new Date(o.expires_at).getTime() : Infinity);

/** Which list an item belongs in. Dismissed items are hidden; missed only counts this year. */
export function viewOf(o: Opportunity, now: Date): MoneyView | null {
  if (o.status === 'dismissed') return null;
  if (o.status === 'claimed') return 'used';
  const past = o.expires_at !== null && t(o) <= now.getTime();
  if (o.status === 'expired' || past) return o.expires_at && new Date(o.expires_at).getFullYear() === now.getFullYear() ? 'missed' : null;
  return 'open';
}

export interface MoneySection {
  title: string;
  items: Opportunity[];
}

export interface MoneyList {
  sections: MoneySection[];
  /** Kinds that have something in this view, for the filter chips. */
  kinds: MoneyKind[];
  /** Open: what's left. Used: what you got back. Missed: what was lost. Unknown amounts count as 0. */
  total: MoneyBag;
  count: number;
}

export function moneyList(
  opportunities: Opportunity[],
  view: MoneyView,
  kind: MoneyKind | 'all',
  now: Date,
  recoveredByOpp: Map<string, number>,
): MoneyList {
  const inView = opportunities.filter((o) => viewOf(o, now) === view);
  const kinds = KIND_ORDER.filter((k) => inView.some((o) => kindOf(o) === k));
  const items = inView.filter((o) => kind === 'all' || kindOf(o) === kind);

  const total: MoneyBag = {};
  for (const o of items) {
    if (o.type === 'protection') continue; // coverage, not cash
    addToBag(total, o.currency, view === 'used' ? recoveredByOpp.get(o.id) ?? o.value_estimate ?? 0 : remainingValue(o, recoveredByOpp));
  }

  let sections: MoneySection[];
  if (view === 'open') {
    const soonFirst = [...items].sort((a, b) => t(a) - t(b) || Number(a.value_estimate === null) - Number(b.value_estimate === null));
    const end = now.getTime() + WEEK_MS;
    sections = [
      { title: 'This week', items: soonFirst.filter((o) => t(o) <= end) },
      { title: 'Later', items: soonFirst.filter((o) => t(o) > end && t(o) !== Infinity) },
      { title: 'No end date', items: soonFirst.filter((o) => t(o) === Infinity) },
    ];
  } else {
    // Newest first: the last thing you used or missed is the one you remember.
    sections = [{ title: '', items: [...items].sort((a, b) => t(b) - t(a)) }];
  }
  return { sections: sections.filter((s) => s.items.length), kinds, total, count: items.length };
}

/**
 * The few things to use next on Home, soonest first. Items with no known amount count as two weeks
 * later than they are, so real money isn't pushed off the list by unverified credits.
 */
export function nextToUse(opportunities: Opportunity[], now: Date, max = 4): Opportunity[] {
  const rank = (o: Opportunity) => t(o) + (o.value_estimate === null ? 2 * WEEK_MS : 0);
  return opportunities
    .filter((o) => viewOf(o, now) === 'open' && o.expires_at !== null && o.type !== 'protection')
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, max)
    .sort((a, b) => t(a) - t(b));
}

export interface SetupStep {
  id: 'cards' | 'inbox';
  title: string;
  done: boolean;
  route: '/add-card' | '/connect-gmail';
}

/** What a new user still has to do before PerkScan can find anything. */
export function setupSteps(d: { userCards: unknown[]; receipts: unknown[]; opportunities: Opportunity[] }): SetupStep[] {
  const readSomething = d.receipts.length > 0 || d.opportunities.some((o) => !!o.source_message_id);
  return [
    { id: 'cards', title: 'Add your cards', done: d.userCards.length > 0, route: '/add-card' },
    { id: 'inbox', title: 'Connect your email or texts', done: readSomething, route: '/connect-gmail' },
  ];
}
