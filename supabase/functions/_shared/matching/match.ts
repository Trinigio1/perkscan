// Matching engine: receipt -> the card that paid -> which of that card's
// protections apply, and which card credits the purchase used up.
// Pure: no database access, so every rule is unit-tested with fixture receipts.

import { fmtMoney } from '../inbox/opportunities.ts';
import type { PurchaseType } from '../inbox/schema.ts';

export interface ReceiptIn {
  id: string;
  merchant: string;
  total: number | null;
  currency: string;
  purchase_date: string | null;
  last_four: string | null;
  purchase_type: PurchaseType | null;
  travel_date: string | null;
}

export interface UserCardIn {
  id: string;
  card_id: string;
  last_four: string;
  /** e.g. "Scotiabank Visa Classic ·· 1234" */
  label: string;
}

export interface BenefitIn {
  id: string;
  card_id: string;
  type: 'credit' | 'protection' | 'perk';
  name: string;
  max_coverage: number | null;
  coverage_window_days: number | null;
  /** Benefit currency, or the card's currency when the benefit doesn't set one. */
  currency: string;
  status: 'active' | 'TODO_VERIFY';
  merchant_match: { merchants: string[] } | null;
  source_url: string | null;
}

export interface OpenCreditIn {
  id: string; // opportunity id
  user_card_id: string;
  benefit_id: string;
  period_start: string; // YYYY-MM-DD
  expires_at: string; // ISO timestamp, exclusive end of the period
  currency: string;
}

export interface ProtectionRow {
  type: 'protection';
  title: string;
  description: string;
  merchant: string;
  code: null;
  /** Always null: coverage is not money owed, so it never counts toward "left on the table". */
  value_estimate: null;
  currency: string;
  expires_at: string | null;
  dedupe_key: string;
  user_card_id: string;
  benefit_id: string;
  action_steps: { step: string; url?: string }[];
}

export type CardMatch = 'last_four' | 'ambiguous' | 'no_card' | 'no_last_four';

export interface MatchResult {
  userCardId: string | null;
  match: CardMatch;
  protections: ProtectionRow[];
  creditUses: { opportunityId: string; amount: number }[];
}

export type ProtectionKind =
  | 'purchase_protection'
  | 'return_protection'
  | 'extended_warranty'
  | 'price_protection'
  | 'cell_phone'
  | 'trip_delay'
  | 'trip_cancellation'
  | 'baggage'
  | 'rental_car';

/** Catalog ids look like "<card>__<kind>". */
export function protectionKind(benefitId: string): ProtectionKind | null {
  const kind = benefitId.split('__')[1];
  const known: ProtectionKind[] = [
    'purchase_protection', 'return_protection', 'extended_warranty', 'price_protection', 'cell_phone',
    'trip_delay', 'trip_cancellation', 'baggage', 'rental_car',
  ];
  return known.includes(kind as ProtectionKind) ? (kind as ProtectionKind) : null;
}

/** Physical goods: what purchase, return, warranty and price protection cover. */
const GOODS: PurchaseType[] = ['electronics', 'appliance', 'phone', 'clothing', 'other_goods'];
const WARRANTY_GOODS: PurchaseType[] = ['electronics', 'appliance', 'phone'];

/** Skip tiny purchases so the list stays useful (in the receipt's own currency). */
export const MIN_GOODS_TOTAL = 50;

const addDays = (d: string, days: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};
const endOfDay = (d: string) => `${d}T23:59:59Z`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "uber" matches "Uber Eats", "UBER *TRIP" etc. */
export function merchantMatches(merchant: string, names: string[]): boolean {
  const m = ` ${norm(merchant)} `;
  return names.some((n) => {
    const k = norm(n);
    return k.length > 0 && (m.includes(` ${k} `) || m.includes(` ${k}`));
  });
}

interface RuleCtx {
  r: ReceiptIn;
  card: UserCardIn;
  b: BenefitIn;
  today: string;
}

function coverageLine(b: BenefitIn, r: ReceiptIn): string | null {
  if (b.max_coverage === null) return null;
  const limit = fmtMoney(b.max_coverage, b.currency);
  return b.currency === r.currency ? `Covered up to ${limit} per claim.` : `Covered up to ${limit} per claim (your receipt is in ${r.currency}).`;
}

function verifiedNote(b: BenefitIn): string {
  return b.status === 'active'
    ? ''
    : ' We haven’t verified this card’s terms yet — check them before relying on this.';
}

function claimSteps(kind: ProtectionKind, card: UserCardIn, b: BenefitIn): { step: string; url?: string }[] {
  const docs: Record<ProtectionKind, string> = {
    purchase_protection: 'Keep the receipt, your card statement showing the purchase, and photos or a police report for damage or theft.',
    return_protection: 'Keep the receipt, your card statement, and the store’s written refusal to take the item back.',
    extended_warranty: 'Keep the receipt, your card statement, and the manufacturer’s warranty.',
    price_protection: 'If you see a lower advertised price, save a screenshot or the ad with the date, plus your receipt and statement.',
    cell_phone: 'Keep your phone bill statements paid with this card and any repair estimate or proof of theft.',
    trip_delay: 'Keep your booking, the airline’s delay notice, and receipts for meals or hotels during the delay.',
    trip_cancellation: 'Keep your booking, proof of the reason for cancelling, and what the airline/hotel refunded.',
    baggage: 'Keep your booking, the airline’s baggage report, and receipts for essentials you had to buy.',
    rental_car: 'Pay for the whole rental with this card and decline the rental company’s collision damage waiver (CDW) — check your card’s terms first.',
  };
  const steps: { step: string; url?: string }[] = [
    { step: docs[kind] },
    { step: `To claim, call the number on the back of your card ending ${card.last_four}. PerkScan never files claims for you.` },
  ];
  if (b.source_url) steps.push({ step: 'Card benefit terms', url: b.source_url });
  return steps;
}

function row(ctx: RuleCtx, kind: ProtectionKind, fields: { title: string; body: string; expires: string | null; dedupe?: string }): ProtectionRow {
  const { r, card, b } = ctx;
  const cov = coverageLine(b, r);
  return {
    type: 'protection',
    title: fields.title,
    description: [fields.body, cov, `${card.label}.`].filter(Boolean).join(' ') + verifiedNote(b),
    merchant: r.merchant,
    code: null,
    value_estimate: null,
    currency: b.currency,
    expires_at: fields.expires ? endOfDay(fields.expires) : null,
    dedupe_key: fields.dedupe ?? `protection:${kind}:${r.id}`,
    user_card_id: card.id,
    benefit_id: b.id,
    action_steps: claimSteps(kind, card, b),
  };
}

/** One rule per protection kind. Returns null when it doesn't apply to this receipt. */
function applyRule(kind: ProtectionKind, ctx: RuleCtx): ProtectionRow | null {
  const { r, b, today } = ctx;
  const type = r.purchase_type;
  const bigEnough = r.total !== null && r.total >= MIN_GOODS_TOTAL;
  const window = (days: number | null) => (r.purchase_date && days ? addDays(r.purchase_date, days) : null);
  const what = r.merchant;

  switch (kind) {
    case 'purchase_protection':
    case 'return_protection': {
      if (!type || !GOODS.includes(type) || !bigEnough) return null;
      const until = window(b.coverage_window_days);
      if (until && until < today) return null;
      const purchase = kind === 'purchase_protection';
      return row(ctx, kind, {
        title: purchase ? `${what} purchase may be protected` : `${what} return may be protected`,
        body: purchase
          ? `If it’s stolen or accidentally damaged${until ? ` before ${until}` : ' soon after you buy it'}, your card may reimburse you.`
          : `If ${what} won’t take it back${until ? ` before ${until}` : ''}, your card may refund you.`,
        expires: until,
      });
    }
    case 'price_protection': {
      if (!type || !GOODS.includes(type) || !bigEnough) return null;
      const until = window(b.coverage_window_days);
      if (until && until < today) return null;
      return row(ctx, kind, {
        title: `Watch the price of your ${what} purchase`,
        body: `If you see it advertised for less${until ? ` before ${until}` : ' soon after buying'}, your card may refund the difference.`,
        expires: until,
      });
    }
    case 'extended_warranty': {
      if (!type || !WARRANTY_GOODS.includes(type) || !bigEnough) return null;
      return row(ctx, kind, {
        title: `${what} purchase may get extra warranty`,
        body: 'If it breaks after the manufacturer’s warranty ends, your card may extend the coverage. Keep the receipt.',
        expires: null,
      });
    }
    case 'cell_phone': {
      if (type !== 'phone_bill') return null;
      return row(ctx, kind, {
        title: 'Your phone may be protected',
        body: `You paid your ${what} bill with this card, so damage or theft of your phone may be covered.`,
        expires: null,
        dedupe: `protection:cell_phone:${ctx.card.id}`, // one per card, not one per bill
      });
    }
    case 'trip_delay':
    case 'trip_cancellation':
    case 'baggage': {
      if (type !== 'flight' && !(kind === 'trip_cancellation' && type === 'hotel')) return null;
      const travel = r.travel_date ?? r.purchase_date;
      if (travel && addDays(travel, 2) < today) return null; // trip is over
      const copy = {
        trip_delay: { title: 'Your trip may be covered for delays', body: 'If your flight is delayed, your card may reimburse meals and a hotel.' },
        trip_cancellation: { title: 'Your trip may be covered if you cancel', body: 'If you have to cancel or cut the trip short for a covered reason, your card may refund prepaid costs.' },
        baggage: { title: 'Your bags may be covered', body: 'If your bags are lost or delayed, your card may reimburse essentials.' },
      }[kind];
      return row(ctx, kind, { ...copy, expires: travel ? addDays(travel, 2) : null });
    }
    case 'rental_car': {
      if (type !== 'car_rental') return null;
      const pickup = r.travel_date ?? r.purchase_date;
      if (pickup && pickup < today) return null;
      return row(ctx, kind, {
        title: 'Your car rental may be covered',
        body: 'Your card may cover theft or collision damage on this rental.',
        expires: pickup,
      });
    }
  }
}

export function matchReceipt(
  r: ReceiptIn,
  userCards: UserCardIn[],
  benefits: BenefitIn[],
  openCredits: OpenCreditIn[],
  today: string,
): MatchResult {
  const none = (match: CardMatch): MatchResult => ({ userCardId: null, match, protections: [], creditUses: [] });
  if (!r.last_four) return none('no_last_four');
  const candidates = userCards.filter((c) => c.last_four === r.last_four);
  if (candidates.length === 0) return none('no_card');
  if (candidates.length > 1) return none('ambiguous'); // two cards with the same last 4: don't guess
  const card = candidates[0]!;
  const cardBenefits = benefits.filter((b) => b.card_id === card.card_id);

  const protections: ProtectionRow[] = [];
  for (const b of cardBenefits) {
    if (b.type !== 'protection') continue;
    const kind = protectionKind(b.id);
    if (!kind) continue;
    const p = applyRule(kind, { r, card, b, today });
    if (p) protections.push(p);
  }

  // Credits: the first open credit on this card whose merchant list matches and
  // whose period contains the purchase date. Only same-currency amounts count.
  const creditUses: MatchResult['creditUses'] = [];
  if (r.total !== null && r.total > 0 && r.purchase_date) {
    const at = r.purchase_date;
    const credit = openCredits
      .filter((c) => c.user_card_id === card.id && c.currency === r.currency)
      .filter((c) => at >= c.period_start && `${at}T00:00:00Z` < c.expires_at)
      .filter((c) => {
        const b = cardBenefits.find((x) => x.id === c.benefit_id);
        return !!b?.merchant_match && merchantMatches(r.merchant, b.merchant_match.merchants);
      })
      .sort((a, b) => a.expires_at.localeCompare(b.expires_at))[0];
    if (credit) creditUses.push({ opportunityId: credit.id, amount: r.total });
  }

  return { userCardId: card.id, match: 'last_four', protections, creditUses };
}
