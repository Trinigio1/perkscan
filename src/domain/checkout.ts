// "Before you pay": for a store, which card to use and what to use with it.
// Only what PerkScan knows is used: credits that apply at the store, protections for
// the kind of purchase, and currency. Earn rates (points / cash back) aren't in the
// catalog yet, so they're never guessed.

import { sameMerchant } from './merchant';
import { remainingValue } from './score';
import type { Card, CardBenefit, Opportunity, Receipt, UserCard } from './types';

export type SpendCategory =
  | 'delivery_rides' | 'dining' | 'groceries' | 'travel' | 'car_rental'
  | 'electronics' | 'shopping' | 'phone_bill' | 'subscriptions' | 'other';

export const SPEND_LABELS: Record<SpendCategory, string> = {
  delivery_rides: 'Delivery & rides',
  dining: 'Dining',
  groceries: 'Groceries',
  travel: 'Flights & hotels',
  car_rental: 'Car rental',
  electronics: 'Electronics',
  shopping: 'Shopping',
  phone_bill: 'Phone bill',
  subscriptions: 'Subscriptions',
  other: 'Other',
};

const FROM_PURCHASE: Record<string, SpendCategory> = {
  food_delivery: 'delivery_rides', rideshare: 'delivery_rides', restaurant: 'dining', groceries: 'groceries',
  flight: 'travel', hotel: 'travel', travel_other: 'travel', car_rental: 'car_rental',
  electronics: 'electronics', appliance: 'electronics', phone: 'electronics',
  clothing: 'shopping', other_goods: 'shopping', phone_bill: 'phone_bill', subscription: 'subscriptions', service: 'subscriptions',
};

/** Protection kinds (from benefit ids "<card>__<kind>") that matter for each kind of purchase. */
const PROTECTIONS: Partial<Record<SpendCategory, string[]>> = {
  electronics: ['purchase_protection', 'extended_warranty', 'price_protection', 'return_protection'],
  shopping: ['purchase_protection', 'price_protection', 'return_protection'],
  travel: ['trip_delay', 'trip_cancellation', 'baggage'],
  car_rental: ['rental_car'],
  phone_bill: ['cell_phone'],
};

const KEYWORDS: [RegExp, SpendCategory][] = [
  [/uber eats|doordash|grubhub|deliveroo|food ?drop|bento/i, 'delivery_rides'],
  [/\buber\b|lyft|taxi|\bride/i, 'delivery_rides'],
  [/airline|airways|caribbean air|\bair\b|hotel|resort|airbnb|expedia|booking\.com|marriott|hilton/i, 'travel'],
  [/hertz|avis|budget|enterprise|rent a car|car rental/i, 'car_rental'],
  [/massy|pricesmart|hi-?lo|supermarket|grocer|xtra foods|whole foods|walmart/i, 'groceries'],
  [/digicel|bmobile|t-?mobile|verizon|at&t|flow\b/i, 'phone_bill'],
  [/apple|best buy|courts|electronics|samsung/i, 'electronics'],
  [/netflix|spotify|disney|hulu|youtube|subscription|icloud/i, 'subscriptions'],
  [/restaurant|kfc|pizza|starbucks|coffee|cafe|grill|bistro|dunkin/i, 'dining'],
  [/amazon|shein|temu|ebay|store|mall|outfitters/i, 'shopping'],
];

/** From your last receipt at the store, else from the name. */
export function guessCategory(merchant: string, receipts: Receipt[]): SpendCategory {
  const past = receipts.find((r) => r.purchase_type && sameMerchant(r.merchant, merchant));
  if (past?.purchase_type && FROM_PURCHASE[past.purchase_type]) return FROM_PURCHASE[past.purchase_type]!;
  return KEYWORDS.find(([re]) => re.test(merchant))?.[1] ?? 'other';
}

/** Stores PerkScan has seen (receipts, offers) or that card credits name, for suggestions. */
export function knownMerchants(receipts: Receipt[], opportunities: Opportunity[], benefits: CardBenefit[]): string[] {
  const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const names = [
    ...receipts.map((r) => r.merchant),
    ...opportunities.map((o) => o.merchant).filter((m): m is string => !!m),
    ...benefits.flatMap((b) => (b.merchant_match?.merchants ?? []).map(titleCase)),
  ];
  const out: string[] = [];
  for (const n of names) {
    const name = n.trim();
    if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export interface Reason {
  kind: 'credit' | 'protection' | 'currency';
  text: string;
  tone: 'good' | 'neutral' | 'warn';
}

export interface CardPick {
  userCardId: string;
  card: Card;
  userCard: UserCard;
  score: number;
  reasons: Reason[];
}

export interface CheckoutStack {
  category: SpendCategory;
  /** Currency of your last receipt at this store, if any. */
  merchantCurrency: string | null;
  cards: CardPick[];
  /** The card with the strongest reasons, or null when none stands out. */
  best: CardPick | null;
  promos: Opportunity[];
  storeCredit: Opportunity[];
}

export interface CheckoutInput {
  cards: Card[];
  benefits: CardBenefit[];
  userCards: UserCard[];
  opportunities: Opportunity[];
  receipts: Receipt[];
  recoveredByOpp: Map<string, number>;
  now: Date;
  /** Formats money; injected so this stays free of UI code. */
  money: (amount: number, currency: string) => string;
}

const live = (o: Opportunity, now: Date) => o.status === 'open' && (!o.expires_at || new Date(o.expires_at) > now);
const kindOf = (benefitId: string) => benefitId.split('__')[1] ?? '';
const PROTECTION_NAMES: Record<string, string> = {
  purchase_protection: 'Purchase protection', extended_warranty: 'Extended warranty', price_protection: 'Price protection',
  return_protection: 'Return protection', trip_delay: 'Trip delay', trip_cancellation: 'Trip cancellation',
  baggage: 'Baggage cover', rental_car: 'Rental car cover', cell_phone: 'Phone protection',
};

export function checkoutStack(merchant: string, category: SpendCategory, d: CheckoutInput): CheckoutStack {
  const merchantCurrency = d.receipts.find((r) => sameMerchant(r.merchant, merchant))?.currency ?? null;
  const wanted = PROTECTIONS[category] ?? [];

  const picks: CardPick[] = [];
  for (const uc of d.userCards) {
    const card = d.cards.find((c) => c.id === uc.card_id);
    if (!card) continue;
    const reasons: Reason[] = [];
    let score = 0;

    // Credits that apply at this store and still have value this period.
    for (const o of d.opportunities) {
      if (o.type !== 'card_credit' || o.user_card_id !== uc.id || !live(o, d.now) || !o.benefit_id) continue;
      const b = d.benefits.find((x) => x.id === o.benefit_id);
      if (!b?.merchant_match?.merchants.some((m) => sameMerchant(m, merchant))) continue;
      if (o.value_estimate === null) {
        reasons.push({ kind: 'credit', text: `${b.name} may apply here (amount not verified)`, tone: 'good' });
        score += 2;
      } else {
        const left = remainingValue(o, d.recoveredByOpp);
        if (left <= 0) continue;
        reasons.push({ kind: 'credit', text: `${b.name}: ${d.money(left, o.currency)} left this period`, tone: 'good' });
        score += 3;
      }
    }

    // Protections for this kind of purchase (at most two count toward the score).
    const prots = d.benefits.filter((b) => b.card_id === card.id && b.type === 'protection' && wanted.includes(kindOf(b.id)));
    prots.forEach((b, i) => {
      reasons.push({
        kind: 'protection',
        text: `${PROTECTION_NAMES[kindOf(b.id)] ?? b.name}${b.status === 'active' ? '' : ' (terms not verified)'}`,
        tone: 'good',
      });
      if (i < 2) score += 1;
    });

    // Currency: a tie-breaker and a heads-up, never a fee amount (none are verified).
    if (merchantCurrency) {
      if (merchantCurrency === card.currency) {
        reasons.push({ kind: 'currency', text: `Charges in ${merchantCurrency}, same as this card`, tone: 'neutral' });
        score += 0.25;
      } else {
        reasons.push({
          kind: 'currency',
          text: `This store charges in ${merchantCurrency}; a ${card.currency} card may add a foreign transaction fee — check with your bank`,
          tone: 'warn',
        });
        score -= 0.25;
      }
    }
    picks.push({ userCardId: uc.id, card, userCard: uc, score, reasons });
  }
  picks.sort((a, b) => b.score - a.score);
  const top = picks[0];
  // Only a credit or a protection makes a card "best"; currency alone doesn't.
  const best = top && top.reasons.some((r) => r.kind !== 'currency') && (picks.length === 1 || top.score > picks[1]!.score) ? top : null;

  const atStore = (o: Opportunity) => !!o.merchant && sameMerchant(o.merchant, merchant) && live(o, d.now);
  return {
    category,
    merchantCurrency,
    cards: picks,
    best,
    promos: d.opportunities.filter((o) => o.type === 'promo' && atStore(o)),
    storeCredit: d.opportunities.filter((o) => (o.type === 'gift_card' || o.type === 'store_credit') && atStore(o)),
  };
}
