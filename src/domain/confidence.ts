import type { Opportunity } from './types';

// How sure PerkScan is about an item, in three plain words instead of a made-up percentage:
//   confirmed: an official source, or something you added yourself
//   likely:    read clearly from an email or text (an amount or code, a date)
//   check:     a guess, or a rule we couldn't confirm — worth checking before relying on it

export type Confidence = 'confirmed' | 'likely' | 'check';

export const CONFIDENCE_LABELS: Record<Confidence, string> = { confirmed: 'Confirmed', likely: 'Likely', check: 'Check' };

export const CONFIDENCE_HELP: Record<Confidence, string> = {
  confirmed: 'From an official source, or added by you.',
  likely: 'Read from your email or text. Double-check the details in the original.',
  check: 'PerkScan isn’t sure about this one. Check it before relying on it.',
};

/** Looks up whether a card benefit has been checked against the issuer's terms. */
export type BenefitStatusOf = (benefitId: string) => 'active' | 'TODO_VERIFY' | undefined;

export function confidenceOf(o: Opportunity, statusOf: BenefitStatusOf = () => undefined): Confidence {
  const key = o.dedupe_key ?? '';
  // Reminders for events that haven't been announced yet stay a "check" until they are.
  if (key.startsWith('manual:unconfirmed:')) return 'check';
  if (key.startsWith('manual:')) return 'confirmed';
  // Saved from Deals for you: the deal's own confidence travels in the key.
  const deal = /^deal:(confirmed|likely|check):/.exec(key);
  if (deal) return deal[1] as Confidence;
  switch (o.type) {
    case 'card_credit':
      // Amounts only exist on verified credits; without one it's the catalog saying "probably".
      return o.value_estimate !== null ? 'confirmed' : 'check';
    case 'protection':
      if (o.benefit_id) return statusOf(o.benefit_id) === 'active' ? 'confirmed' : 'check';
      return 'likely'; // a warranty stated on the receipt
    case 'price_drop':
      return 'confirmed'; // the store's official policy window
    case 'refund':
      return key.startsWith('double_charge:') ? 'check' : 'likely';
    case 'settlement':
      // Matched by store and dates; whether you're a class member is for the official site to say.
      // Catalog matches are "settlement:<id>"; ones the reader found in an email have more parts.
      return /^settlement:[^:]+$/.test(key) ? 'check' : 'likely';
    case 'free_trial':
    case 'return_window':
    case 'certificate':
      return o.expires_at ? 'likely' : 'check';
    default:
      // Promos, gift cards, store credit, points: something concrete to act on.
      return o.value_estimate !== null || !!o.code ? 'likely' : 'check';
  }
}

const DAY = 86_400_000;
const CONFIDENCE_ORDER: Record<Confidence, number> = { confirmed: 0, likely: 1, check: 2 };

/** How urgent: 0 = within 2 days, 1 = this week, 2 = this month, 3 = later, 4 = no end date. */
export function urgency(o: Pick<Opportunity, 'expires_at'>, now: Date): number {
  if (!o.expires_at) return 4;
  const days = (new Date(o.expires_at).getTime() - now.getTime()) / DAY;
  return days <= 2 ? 0 : days <= 7 ? 1 : days <= 31 ? 2 : 3;
}

/**
 * The order to show things in: what you'd lose soonest first, then the surer thing, then the
 * bigger amount (only compared within one currency, since amounts are never converted), then the date.
 */
export function rankCompare(now: Date, statusOf?: BenefitStatusOf) {
  return (a: Opportunity, b: Opportunity): number => {
    const u = urgency(a, now) - urgency(b, now);
    if (u) return u;
    const c = CONFIDENCE_ORDER[confidenceOf(a, statusOf)] - CONFIDENCE_ORDER[confidenceOf(b, statusOf)];
    if (c) return c;
    const known = Number(a.value_estimate === null) - Number(b.value_estimate === null);
    if (known) return known;
    if (a.currency === b.currency && a.value_estimate !== null && b.value_estimate !== null && a.value_estimate !== b.value_estimate) {
      return b.value_estimate - a.value_estimate;
    }
    const at = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
    const bt = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
    return at - bt;
  };
}
