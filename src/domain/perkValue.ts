import { annualCreditValue } from './worthIt';
import { addToBag, formatMoney, shortCardName, type MoneyBag } from './format';
import { includedWhenYouNeedIt, type IncludedItem } from './included';
import type { Card, CardBenefit, Receipt, UserCard } from './types';

// "What your perks are worth": every card and membership perk with a dollar figure behind it, so a
// lounge membership counts for something. Three kinds, each labeled with where the number comes from:
//   - statement credits: the issuer's own amount, a full year of it;
//   - perks with a yearly allowance (4 lounge visits, 2 club passes): allowance × the provider's price;
//   - perks you use per trip (a lounge visit, a free checked bag): the price × your own flights this
//     past year. Not used yet: the price per use is shown, and nothing is added.
// Nothing is invented: a perk without a sourced price is left out of the total. Pure, so it's tested.

export interface Trips {
  /** Flight bookings in your receipts over the last 12 months. */
  flights: number;
  byAirline: Partial<Record<Airline, number>>;
}

type Airline = 'delta' | 'united' | 'american';
const AIRLINES: [Airline, RegExp][] = [
  ['delta', /\bdelta\b/i],
  ['united', /\bunited\b/i],
  ['american', /american airlines|aadvantage/i],
];
const airlineOf = (text: string): Airline | null => AIRLINES.find(([, re]) => re.test(text))?.[0] ?? null;

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Your flights in the last 12 months, one per booking (the same order seen twice counts once). */
export function tripsInLastYear(receipts: Pick<Receipt, 'merchant' | 'purchase_type' | 'purchase_date' | 'order_number'>[], now: Date): Trips {
  const seen = new Set<string>();
  const trips: Trips = { flights: 0, byAirline: {} };
  for (const r of receipts) {
    if (r.purchase_type !== 'flight' || !r.purchase_date) continue;
    const at = new Date(`${r.purchase_date.slice(0, 10)}T12:00:00Z`).getTime();
    if (!(now.getTime() - at <= YEAR_MS && at <= now.getTime())) continue;
    const key = `${r.merchant.toLowerCase()}|${r.order_number?.trim() || r.purchase_date.slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    trips.flights += 1;
    const airline = airlineOf(r.merchant);
    if (airline) trips.byAirline[airline] = (trips.byAirline[airline] ?? 0) + 1;
  }
  return trips;
}

/**
 * How many times this past year you'd have used a per-use perk: a lounge visit on each flight, a free
 * bag on each flight with the card's own airline. One per booking, so it never overcounts a round trip.
 */
export function usesThisYear(x: Pick<IncludedItem, 'benefitId' | 'from'>, trips: Trips): number {
  const key = x.benefitId.split('__')[1] ?? '';
  if (/lounge|club_pass/.test(key)) return trips.flights;
  if (/checked_bag/.test(key)) {
    const airline = airlineOf(x.from) ?? airlineOf(x.benefitId);
    return airline ? (trips.byAirline[airline] ?? 0) : 0;
  }
  return 0;
}

export interface WorthLine {
  key: string;
  userCardId: string;
  title: string;
  /** "Chase Sapphire Reserve ·· 4242". */
  from: string;
  value: number;
  currency: string;
  /** Where the number comes from, in a few words. */
  how: string;
  /** The issuer's own amount (true), or an estimate from a price (false, shown with ≈). */
  stated: boolean;
}

export interface PerUse {
  key: string;
  title: string;
  from: string;
  worth: number;
  currency: string;
  basis: string | null;
}

export interface PerksWorth {
  lines: WorthLine[];
  total: MoneyBag;
  /** Statement credits: the issuer's own amounts. */
  credits: MoneyBag;
  /** Perks valued from a price (≈). */
  perks: MoneyBag;
  /** What the cards and memberships cost a year. */
  fees: MoneyBag;
  /** Perks worth something each time you use them, not used this past year (not in the total). */
  perUse: PerUse[];
  trips: Trips;
}

const PERIOD_WORD: Record<string, string> = { monthly: 'a month', quarterly: 'a quarter', semiannual: 'every 6 months', annual: 'a year' };

export function perksWorth(
  userCards: Pick<UserCard, 'id' | 'card_id' | 'last_four'>[],
  cards: Pick<Card, 'id' | 'kind' | 'product_name' | 'currency' | 'annual_fee'>[],
  benefits: Pick<CardBenefit, 'id' | 'card_id' | 'type' | 'name' | 'amount' | 'amount_schedule' | 'period' | 'status' | 'terms_summary' | 'currency' | 'worth' | 'worth_period' | 'worth_basis'>[],
  receipts: Pick<Receipt, 'merchant' | 'purchase_type' | 'purchase_date' | 'order_number'>[],
  now: Date,
): PerksWorth {
  const trips = tripsInLastYear(receipts, now);
  const lines: WorthLine[] = [];
  const perUse: PerUse[] = [];
  const fees: MoneyBag = {};
  for (const uc of userCards) {
    const card = cards.find((c) => c.id === uc.card_id);
    if (!card) continue;
    if (card.annual_fee) addToBag(fees, card.currency, card.annual_fee);
    const from = card.kind === 'membership' ? card.product_name : `${shortCardName(card.product_name)}${uc.last_four ? ` ·· ${uc.last_four}` : ''}`;
    // Credits that reset: a full year of them, at the issuer's own amounts.
    for (const b of benefits) {
      if (b.card_id !== uc.card_id || b.type !== 'credit' || b.status !== 'active' || b.period === 'per_claim') continue;
      const year = annualCreditValue(b);
      if (!year) continue;
      const cur = b.currency ?? card.currency;
      lines.push({ key: `${uc.id}:${b.id}`, userCardId: uc.id, title: b.name, from, value: year, currency: cur, how: `${formatMoney(b.amount!, { currency: cur })} ${PERIOD_WORD[b.period] ?? ''}, from the issuer`.trim(), stated: true });
    }
  }
  // One-time credits, and perks with a price behind them.
  for (const x of includedWhenYouNeedIt(userCards, cards, benefits)) {
    if (!x.currency) continue;
    if (x.amount !== null) {
      lines.push({ key: x.key, userCardId: x.userCardId, title: x.title, from: x.from, value: x.amount, currency: x.currency, how: `Up to ${formatMoney(x.amount, { currency: x.currency })} back when you pay for it`, stated: true });
    } else if (x.worth && x.worthPeriod === 'year') {
      lines.push({ key: x.key, userCardId: x.userCardId, title: x.title, from: x.from, value: x.worth, currency: x.currency, how: x.worthBasis ?? '', stated: false });
    } else if (x.worth && x.worthPeriod === 'use') {
      const uses = usesThisYear(x, trips);
      if (uses > 0) {
        const each = formatMoney(x.worth, { currency: x.currency });
        lines.push({ key: x.key, userCardId: x.userCardId, title: x.title, from: x.from, value: x.worth * uses, currency: x.currency, how: `${uses} flight${uses === 1 ? '' : 's'} this past year × ${each}. ${x.worthBasis ?? ''}`.trim(), stated: false });
      } else {
        perUse.push({ key: x.key, title: x.title, from: x.from, worth: x.worth, currency: x.currency, basis: x.worthBasis });
      }
    }
  }
  lines.sort((a, b) => b.value - a.value);
  const credits: MoneyBag = {};
  const perks: MoneyBag = {};
  for (const l of lines) addToBag(l.stated ? credits : perks, l.currency, l.value);
  const total: MoneyBag = {};
  for (const l of lines) addToBag(total, l.currency, l.value);
  return { lines, total, credits, perks, fees, perUse: perUse.sort((a, b) => b.worth - a.worth), trips };
}
