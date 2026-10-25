import { PERIODS_PER_YEAR } from './worthIt';
import type { Card, CardBenefit, Receipt, UserCard } from './types';

// "You may be paying twice": a subscription the user's receipts show they pay for, that a membership
// they have includes (Walmart+ includes Peacock) or a card credits back (Amex Platinum: up to $25 a
// month on Hulu). Only real charges from their own receipts are shown — nothing estimated.
// Also: memberships the user pays for but hasn't added yet. Pure, so every rule is tested.

export interface Service {
  key: string;
  name: string;
  match: RegExp;
  /** The membership this charge *is*, e.g. paying for Walmart+ itself. */
  membership?: string;
}

export const SERVICES: Service[] = [
  { key: 'netflix', name: 'Netflix', match: /netflix/i },
  { key: 'hulu', name: 'Hulu', match: /\bhulu\b/i },
  { key: 'disney', name: 'Disney+', match: /disney\s*(\+|plus)/i },
  { key: 'peacock', name: 'Peacock', match: /peacock/i },
  { key: 'paramount', name: 'Paramount+', match: /paramount\s*(\+|plus)/i },
  { key: 'espn', name: 'ESPN', match: /\bespn\b/i },
  { key: 'youtube', name: 'YouTube Premium', match: /youtube\s*(premium|tv)/i },
  { key: 'nyt', name: 'The New York Times', match: /new york times|nytimes/i },
  { key: 'wsj', name: 'The Wall Street Journal', match: /wall street journal|\bwsj\b/i },
  { key: 'grubhub_plus', name: 'Grubhub+', match: /grubhub\s*(\+|plus)/i },
  { key: 'clear', name: 'CLEAR+', match: /^clear\b|clear\s*(\+|plus|secure)|clearme/i },
  { key: 'peloton', name: 'Peloton', match: /peloton/i },
  { key: 'equinox', name: 'Equinox', match: /equinox/i },
  { key: 'walmart_plus', name: 'Walmart+', match: /walmart\s*(\+|plus)/i, membership: 'walmart_plus' },
  { key: 'amazon_prime', name: 'Amazon Prime', match: /amazon prime|prime membership/i, membership: 'amazon_prime' },
  { key: 'instacart_plus', name: 'Instacart+', match: /instacart\s*(\+|plus)/i, membership: 'instacart_plus' },
  { key: 'uber_one', name: 'Uber One', match: /uber\s*one/i, membership: 'uber_one' },
  { key: 'dashpass', name: 'DashPass', match: /dashpass/i, membership: 'dashpass' },
  { key: 'target_360', name: 'Target Circle 360', match: /circle\s*360/i, membership: 'target_circle_360' },
  { key: 'sams_plus', name: "Sam's Club Plus", match: /sam'?s\s*club\s*plus/i, membership: 'sams_club_plus' },
  { key: 'costco_exec', name: 'Costco Executive', match: /costco.*executive/i, membership: 'costco_executive' },
];

export const serviceOf = (merchant: string | null | undefined): Service | null => (merchant ? SERVICES.find((s) => s.match.test(merchant)) ?? null : null);

export interface Charge {
  service: Service;
  amount: number;
  currency: string;
  date: string;
  /** The card it was charged to, if PerkScan matched it. */
  userCardId: string | null;
}

/** The latest charge per subscription service in the user's receipts since `since` (YYYY-MM-DD). */
export function recentCharges(receipts: Pick<Receipt, 'merchant' | 'total' | 'currency' | 'purchase_date' | 'matched_user_card_id'>[], since: string): Charge[] {
  const latest = new Map<string, Charge>();
  for (const r of receipts) {
    if (r.total === null || r.total <= 0 || !r.purchase_date || r.purchase_date < since) continue;
    const service = serviceOf(r.merchant);
    if (!service) continue;
    const prev = latest.get(service.key);
    if (!prev || prev.date < r.purchase_date) {
      latest.set(service.key, { service, amount: r.total, currency: r.currency, date: r.purchase_date, userCardId: r.matched_user_card_id });
    }
  }
  return [...latest.values()];
}

export interface Cover {
  /** "Walmart+", "Amex Platinum ·· 1001". */
  by: string;
  kind: 'included' | 'credit';
  /** What it saves on this charge: all of it if included, up to a month's credit otherwise. */
  saving: number;
  /** "Walmart+ includes Paramount+ Essential or Peacock Premium included". */
  benefitName: string;
  enroll: boolean;
}

export interface PayingTwice {
  charge: Charge;
  covers: Cover[];
  /** The best saving among the covers. */
  saving: number;
}

/** Does a benefit's merchant list name this service? */
const covers = (b: Pick<CardBenefit, 'merchant_match'>, s: Service) => (b.merchant_match?.merchants ?? []).some((m) => s.match.test(m));

/**
 * Charges a membership or card the user has already covers. Included perks save the whole charge.
 * A credit saves up to one month of it — unless the charge was already paid with that card, in
 * which case the credit is being used and there's nothing to point out. Biggest saving first.
 */
export function payingTwice(
  charges: Charge[],
  userCards: Pick<UserCard, 'id' | 'card_id'>[],
  benefits: Pick<CardBenefit, 'card_id' | 'type' | 'name' | 'amount' | 'period' | 'merchant_match' | 'status' | 'enrollment_required'>[],
  label: (userCardId: string) => string,
): PayingTwice[] {
  const out: PayingTwice[] = [];
  for (const charge of charges) {
    const found: Cover[] = [];
    for (const uc of userCards) {
      // Paying for a membership you've added is just your membership.
      if (charge.service.membership === uc.card_id) continue;
      for (const b of benefits) {
        if (b.card_id !== uc.card_id || b.status !== 'active' || !covers(b, charge.service)) continue;
        if (b.type === 'perk') {
          found.push({ by: label(uc.id), kind: 'included', saving: charge.amount, benefitName: b.name, enroll: b.enrollment_required });
        } else if (b.type === 'credit' && b.amount !== null && b.period !== 'per_claim' && charge.userCardId !== uc.id) {
          const monthly = (b.amount * PERIODS_PER_YEAR[b.period]) / 12;
          found.push({ by: label(uc.id), kind: 'credit', saving: Math.round(Math.min(charge.amount, monthly) * 100) / 100, benefitName: b.name, enroll: b.enrollment_required });
        }
      }
    }
    if (found.length) {
      found.sort((a, b) => b.saving - a.saving);
      out.push({ charge, covers: found, saving: found[0]!.saving });
    }
  }
  return out.sort((a, b) => b.saving - a.saving);
}

export interface MembershipHint {
  membershipId: string;
  name: string;
  lastCharged: string;
}

/** Memberships the user's receipts show they pay for but haven't added. */
export function membershipHints(charges: Charge[], userCards: Pick<UserCard, 'card_id'>[], catalog: Pick<Card, 'id' | 'kind'>[]): MembershipHint[] {
  const have = new Set(userCards.map((u) => u.card_id));
  return charges
    .filter((c) => c.service.membership && !have.has(c.service.membership) && catalog.some((k) => k.id === c.service.membership && k.kind === 'membership'))
    .map((c) => ({ membershipId: c.service.membership!, name: c.service.name, lastCharged: c.date }));
}
