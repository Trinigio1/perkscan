import { addToBag, shortCardName, type MoneyBag } from './format';
import type { Card, CardBenefit, UserCard } from './types';

// "When you need it": what your cards and memberships give back only when you pay for something
// (a $100 Global Entry or TSA PreCheck credit) and what a membership includes ($0 delivery fees).
// Real, but not money in hand, so never in Ready to use. Pure, so every rule is tested.

export interface IncludedItem {
  key: string;
  userCardId: string;
  /** "Bank of America Premium Rewards ·· 6042", "Uber One". */
  from: string;
  title: string;
  /** "Up to $100 back", for a credit with a stated amount. */
  amount: number | null;
  currency: string | null;
  terms: string | null;
  kind: 'credit' | 'membership_perk' | 'card_perk';
  /** What a perk with no stated amount is worth, by the provider's own figure. */
  worth: number | null;
  worthPeriod: 'year' | 'use' | null;
  /** Where the worth comes from, shown with it. */
  worthBasis: string | null;
}

// Card perks worth showing here: access and memberships that come with the card, not ways of earning rewards.
const ACCESS_PERK = /lounge|dashpass|grubhub|status|checked bag|free night|companion|club pass|membership/i;

export function includedWhenYouNeedIt(
  userCards: Pick<UserCard, 'id' | 'card_id' | 'last_four'>[],
  cards: Pick<Card, 'id' | 'kind' | 'product_name' | 'currency'>[],
  benefits: Pick<CardBenefit, 'id' | 'card_id' | 'type' | 'name' | 'amount' | 'period' | 'status' | 'terms_summary' | 'currency' | 'worth' | 'worth_period' | 'worth_basis'>[],
): IncludedItem[] {
  const out: IncludedItem[] = [];
  for (const uc of userCards) {
    const card = cards.find((c) => c.id === uc.card_id);
    if (!card) continue;
    const from = card.kind === 'membership' ? card.product_name : `${shortCardName(card.product_name)}${uc.last_four ? ` ·· ${uc.last_four}` : ''}`;
    for (const b of benefits) {
      if (b.card_id !== uc.card_id || b.status !== 'active') continue;
      // A credit you get back once you pay for something (no monthly or yearly reset): Global Entry, PreCheck, CLEAR.
      const worth = { worth: b.worth ?? null, worthPeriod: b.worth !== null && b.worth !== undefined ? (b.worth_period ?? null) : null, worthBasis: b.worth_basis ?? null };
      const base = { key: `${uc.id}:${b.id}`, userCardId: uc.id, from, title: b.name, terms: b.terms_summary, ...worth };
      if (b.type === 'credit' && b.period === 'per_claim' && b.amount !== null) {
        out.push({ ...base, amount: b.amount, currency: b.currency ?? card.currency, kind: 'credit' });
      } else if (card.kind === 'membership' && b.type === 'perk') {
        out.push({ ...base, amount: null, currency: b.worth ? (b.currency ?? card.currency) : null, kind: 'membership_perk' });
      } else if (card.kind !== 'membership' && b.type === 'perk' && (b.worth || ACCESS_PERK.test(b.name))) {
        out.push({ ...base, amount: null, currency: b.worth ? (b.currency ?? card.currency) : null, kind: 'card_perk' });
      }
    }
  }
  // Things with a dollar figure first, biggest first; then the rest.
  const figure = (x: IncludedItem) => x.amount ?? x.worth ?? -1;
  return out.sort((a, b) => figure(b) - figure(a));
}

/**
 * What your cards and memberships give you that isn't money in hand, for Home's "Save up to": credits
 * you get back when you pay for something (up to their amount) and perks with a yearly worth. Per-use
 * worths (a checked bag on each flight) are shown on the perk but not added up: how often is up to you.
 */
export function includedWorth(items: IncludedItem[]): { total: MoneyBag; count: number } {
  const total: MoneyBag = {};
  let count = 0;
  for (const x of items) {
    const v = x.amount ?? (x.worthPeriod === 'year' ? x.worth : null);
    if (v && x.currency) {
      addToBag(total, x.currency, v);
      count += 1;
    }
  }
  return { total, count };
}
