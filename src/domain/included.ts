import { shortCardName } from './format';
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
  kind: 'credit' | 'membership_perk';
}

export function includedWhenYouNeedIt(
  userCards: Pick<UserCard, 'id' | 'card_id' | 'last_four'>[],
  cards: Pick<Card, 'id' | 'kind' | 'product_name' | 'currency'>[],
  benefits: Pick<CardBenefit, 'id' | 'card_id' | 'type' | 'name' | 'amount' | 'period' | 'status' | 'terms_summary' | 'currency'>[],
): IncludedItem[] {
  const out: IncludedItem[] = [];
  for (const uc of userCards) {
    const card = cards.find((c) => c.id === uc.card_id);
    if (!card) continue;
    const from = card.kind === 'membership' ? card.product_name : `${shortCardName(card.product_name)}${uc.last_four ? ` ·· ${uc.last_four}` : ''}`;
    for (const b of benefits) {
      if (b.card_id !== uc.card_id || b.status !== 'active') continue;
      // A credit you get back once you pay for something (no monthly or yearly reset): Global Entry, PreCheck, CLEAR.
      if (b.type === 'credit' && b.period === 'per_claim' && b.amount !== null) {
        out.push({ key: `${uc.id}:${b.id}`, userCardId: uc.id, from, title: b.name, amount: b.amount, currency: b.currency ?? card.currency, terms: b.terms_summary, kind: 'credit' });
      } else if (card.kind === 'membership' && b.type === 'perk') {
        out.push({ key: `${uc.id}:${b.id}`, userCardId: uc.id, from, title: b.name, amount: null, currency: null, terms: b.terms_summary, kind: 'membership_perk' });
      }
    }
  }
  // Credits with an amount first, biggest first; then membership perks.
  return out.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));
}
