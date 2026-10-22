// Why "left on the table" is $0 (or low), in plain words, from the user's own data.
// Only states facts PerkScan has; never estimates money it doesn't know about.

import type { Card, CardBenefit, Opportunity, UserCard } from './types';

export interface ZeroReason {
  id: 'no_cards' | 'no_credits' | 'unverified_credits' | 'no_value_offers' | 'nothing_expired' | 'no_offers';
  text: string;
  /** Where the user can act on it, if anywhere. */
  action?: { label: string; route: '/add-card' | '/connect-gmail' | '/connect-texts' | '/offers' | '/credits' };
}

const MONEY_TYPES = ['promo', 'gift_card', 'store_credit', 'points', 'settlement'];

export function zeroReasons(input: {
  cards: Card[];
  benefits: CardBenefit[];
  userCards: UserCard[];
  opportunities: Opportunity[];
  /** Still usable, already formatted per currency, e.g. "TT$50", or null when nothing. */
  readyToUse: string | null;
}): ZeroReason[] {
  const { cards, benefits, userCards, opportunities } = input;
  const out: ZeroReason[] = [];
  const name = (uc: UserCard) => (cards.find((c) => c.id === uc.card_id)?.product_name ?? 'Your card').replace(/®/g, '');

  if (!userCards.length) {
    out.push({ id: 'no_cards', text: 'You haven’t added a card yet, so there are no card credits to track.', action: { label: 'Add cards', route: '/add-card' } });
  } else {
    const credits = (uc: UserCard) => benefits.filter((b) => b.card_id === uc.card_id && b.type === 'credit');
    const without = userCards.filter((uc) => credits(uc).length === 0);
    if (without.length) {
      const names = [...new Set(without.map(name))].join(', ');
      out.push({
        id: 'no_credits',
        text: `${names} ${without.length === 1 ? 'has' : 'have'} no statement credits — nothing on ${without.length === 1 ? 'it' : 'them'} expires unused. Card protections are coverage, not cash, so they never count.`,
      });
    }
    const unverified = userCards.flatMap(credits).filter((b) => b.amount === null).length;
    if (unverified) {
      out.push({
        id: 'unverified_credits',
        text: `${unverified} credit${unverified === 1 ? '' : 's'} on your cards ${unverified === 1 ? 'doesn’t' : 'don’t'} have a verified amount yet, so ${unverified === 1 ? 'it counts' : 'they count'} as $0 instead of a guess.`,
        action: { label: 'See credits', route: '/credits' },
      });
    }
  }

  const offers = opportunities.filter((o) => o.type !== 'card_credit' && o.type !== 'protection');
  if (!offers.length) {
    out.push({
      id: 'no_offers',
      text: 'No offers found yet. Promo codes, gift cards and store credit in your emails and texts count once PerkScan sees them.',
      action: { label: 'Connect Gmail', route: '/connect-gmail' },
    });
  } else {
    const noValue = offers.filter((o) => MONEY_TYPES.includes(o.type) && o.value_estimate === null).length;
    if (noValue) {
      out.push({
        id: 'no_value_offers',
        text: `${noValue} offer${noValue === 1 ? '' : 's'} you have ${noValue === 1 ? 'doesn’t' : 'don’t'} state a dollar amount (like “20% off”), so ${noValue === 1 ? 'it doesn’t' : 'they don’t'} add to the total.`,
        action: { label: 'See offers', route: '/offers' },
      });
    }
  }

  if (input.readyToUse) {
    out.push({
      id: 'nothing_expired',
      text: `${input.readyToUse} is still yours to use. It only counts as left on the table if it expires unused — that’s the point of the reminders.`,
    });
  }
  return out;
}
