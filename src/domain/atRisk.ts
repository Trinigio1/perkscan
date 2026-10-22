import { addToBag, type MoneyBag } from './format';
import { remainingValue } from './score';
import type { Opportunity } from './types';

// Where "at risk this week" comes from: each card, store or sender, with what's expiring there.

export type SourceKind = 'card' | 'store' | 'other';

export interface RiskSource {
  key: string;
  kind: SourceKind;
  /** "Scotiabank Visa ·· 7290", "KFC", or "Other". */
  label: string;
  items: Opportunity[];
  /** What's left on these items, per currency. Items with no known value add nothing. */
  total: MoneyBag;
  /** The soonest expiry in this group. */
  firstExpiry: string;
}

/**
 * Groups at-risk items by where the money is: the card a credit or protection belongs to,
 * otherwise the store the offer is for. Groups come soonest-expiring first.
 */
export function groupAtRisk(items: Opportunity[], recoveredByOpp: Map<string, number>, cardLabel: (userCardId: string) => string): RiskSource[] {
  const groups = new Map<string, RiskSource>();
  for (const o of items) {
    const card = o.user_card_id ? cardLabel(o.user_card_id) : '';
    const store = o.merchant?.trim() ?? '';
    const [key, kind, label]: [string, SourceKind, string] = card
      ? [`card:${o.user_card_id}`, 'card', card]
      : store
        ? [`store:${store.toLowerCase()}`, 'store', store]
        : ['other', 'other', 'Other'];
    const g = groups.get(key) ?? { key, kind, label, items: [], total: {}, firstExpiry: o.expires_at ?? '' };
    g.items.push(o);
    addToBag(g.total, o.currency, remainingValue(o, recoveredByOpp));
    if (o.expires_at && (!g.firstExpiry || o.expires_at < g.firstExpiry)) g.firstExpiry = o.expires_at;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => (a.expires_at ?? '').localeCompare(b.expires_at ?? '')) }))
    .sort((a, b) => a.firstExpiry.localeCompare(b.firstExpiry) || a.label.localeCompare(b.label));
}

/** "Uber Cash, KFC +2 more": what the home tile says the money at risk is. */
export function sourcesLine(sources: RiskSource[], max = 2): string | null {
  if (!sources.length) return null;
  const names = sources.slice(0, max).map((s) => (s.kind === 'card' && s.items.length === 1 ? s.items[0]!.title : s.label));
  const rest = sources.length - max;
  return `${names.join(', ')}${rest > 0 ? ` +${rest} more` : ''}`;
}
