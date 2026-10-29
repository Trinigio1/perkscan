import { addToBag, shortCardName, type MoneyBag } from './format';
import { mySubscriptions } from './mySubscriptions';
import { SERVICES } from './subscriptions';
import type { Card, CardBenefit, Opportunity, Receipt, Recovered, UserCard } from './types';

// "What you pay for": each card and membership with a fee, set against what it actually gave back this
// year (credits you used, and member savings your receipts show), what's still left to use, and the perks
// that only work once you turn them on. Facts only: PerkScan never says to cancel or keep anything.
// Pure, so every rule is tested.

export interface ReceiptDiscountLine {
  description: string;
  code: string | null;
  amount: number | null;
}

export type ReceiptWithDiscounts = Pick<Receipt, 'id' | 'merchant' | 'total' | 'currency' | 'purchase_date' | 'purchase_type'> & {
  discounts?: ReceiptDiscountLine[] | null;
};

export interface SetupItem {
  /** `${userCardId}:${benefitId}`. */
  key: string;
  userCardId: string;
  benefitId: string;
  /** "Amazon Prime", "Amex Gold ·· 1001". */
  from: string;
  title: string;
  /** The catalog's own words on how to turn it on. */
  how: string | null;
  url: string | null;
}

export interface PaidFor {
  userCardId: string;
  name: string;
  kind: 'card' | 'membership';
  /** What it costs a year: what your receipts show you pay, else the catalog's yearly price. */
  fee: number;
  /** Where the fee comes from. */
  feeFrom: 'receipts' | 'catalog';
  currency: string;
  /** Card credits you marked used (or PerkScan saw used) this year. */
  creditsUsed: number;
  /** Member savings printed on your receipts this year ("Uber One savings $3.49"). */
  memberSavings: number;
  savingsReceipts: number;
  /** creditsUsed + memberSavings. */
  gotBack: number;
  /** Card credits you can still use this year: what's open now plus periods still to come. */
  creditsLeft: number;
  /** Perks that need turning on, not yet answered. */
  setup: SetupItem[];
}

export type SetupAnswer = 'done' | 'skipped';

/** Lines on a receipt that are a membership's own savings. Prime's lines just say "Prime". */
const SAVINGS_LINE: Record<string, RegExp> = {
  amazon_prime: /\bprime\b/i,
  ...Object.fromEntries(SERVICES.filter((s) => s.membership && s.membership !== 'amazon_prime').map((s) => [s.membership!, s.match])),
};

/** Member savings printed on receipts between two dates, for the memberships you have (by card id). */
export function membershipSavingsIn(receipts: ReceiptWithDiscounts[], membershipIds: string[], currency: string, from: Date, to: Date): { total: number; receipts: number } {
  const lines = membershipIds.map((id) => SAVINGS_LINE[id]).filter((re): re is RegExp => !!re);
  let total = 0;
  let count = 0;
  for (const r of receipts) {
    if (!r.purchase_date || r.currency !== currency) continue;
    const t = new Date(`${r.purchase_date}T12:00:00`).getTime();
    if (t < from.getTime() || t >= to.getTime()) continue;
    const saved = (r.discounts ?? []).filter((x) => x.amount !== null && x.amount > 0 && lines.some((re) => re.test(x.description)));
    if (!saved.length) continue;
    total += saved.reduce((n, x) => n + x.amount!, 0);
    count += 1;
  }
  return { total: Math.round(total * 100) / 100, receipts: count };
}

/** Words that mean a perk only works after you do something. */
const NEEDS_SETUP = /\benroll|\bactivate|\blink (it|your)|\badd (the|your) [\w\s’'®]+ to your\b|\bpick one\b|\bsign up\b|\bregister\b/i;

/** A perk or credit that only works once you turn it on: flagged in the catalog, or its terms say so. */
export function needsSetup(b: Pick<CardBenefit, 'type' | 'enrollment_required' | 'terms_summary' | 'status'>): boolean {
  if (b.status !== 'active' || b.type === 'protection') return false;
  return b.enrollment_required || NEEDS_SETUP.test(b.terms_summary ?? '');
}

const PERIODS: Partial<Record<CardBenefit['period'], number>> = { monthly: 12, quarterly: 4, semiannual: 2 };

/** Whole calendar periods that start after now and before the year ends. */
function periodsLeftAfterNow(period: CardBenefit['period'], now: Date): number {
  const n = PERIODS[period];
  if (!n) return 0;
  const months = 12 / n;
  const current = Math.floor(now.getMonth() / months);
  return n - 1 - current;
}

export function paidFor(
  d: {
    userCards: Pick<UserCard, 'id' | 'card_id' | 'last_four'>[];
    cards: Pick<Card, 'id' | 'kind' | 'product_name' | 'annual_fee' | 'currency'>[];
    benefits: Pick<CardBenefit, 'id' | 'card_id' | 'type' | 'name' | 'amount' | 'period' | 'period_anchor' | 'status' | 'enrollment_required' | 'terms_summary' | 'source_url' | 'currency'>[];
    opportunities: Pick<Opportunity, 'id' | 'type' | 'user_card_id' | 'benefit_id' | 'status' | 'value_estimate' | 'currency' | 'expires_at'>[];
    recovered: Pick<Recovered, 'opportunity_id' | 'amount' | 'currency' | 'recovered_at'>[];
    receipts: ReceiptWithDiscounts[];
    setup: { user_card_id: string; benefit_id: string; status: SetupAnswer }[];
    isStudent?: boolean;
  },
  now: Date,
): PaidFor[] {
  const year = now.getFullYear();
  const thisYear = (iso: string | null | undefined) => !!iso && new Date(iso).getFullYear() === year;
  const answered = new Set(d.setup.map((s) => `${s.user_card_id}:${s.benefit_id}`));
  const subs = mySubscriptions(d.receipts.map((r) => ({ ...r, total: r.total })), now, !!d.isStudent);
  const out: PaidFor[] = [];

  for (const uc of d.userCards) {
    const card = d.cards.find((c) => c.id === uc.card_id);
    if (!card) continue;
    const name = card.kind === 'membership' ? card.product_name : `${shortCardName(card.product_name)}${uc.last_four ? ` ·· ${uc.last_four}` : ''}`;
    const mine = d.benefits.filter((b) => b.card_id === card.id && b.status === 'active');

    // Perks to turn on, minus the ones already answered or already used (a used credit is clearly on).
    const usedBenefits = new Set(
      d.opportunities.filter((o) => o.user_card_id === uc.id && o.benefit_id && (o.status === 'claimed' || d.recovered.some((r) => r.opportunity_id === o.id))).map((o) => o.benefit_id!),
    );
    const setup: SetupItem[] = mine
      .filter((b) => needsSetup(b) && !answered.has(`${uc.id}:${b.id}`) && !usedBenefits.has(b.id))
      .map((b) => ({ key: `${uc.id}:${b.id}`, userCardId: uc.id, benefitId: b.id, from: name, title: b.name, how: b.terms_summary, url: b.source_url }));

    // The fee: what you're charged, from receipts, for a membership; the card's annual fee otherwise.
    const charged = card.kind === 'membership' ? subs.find((s) => s.service?.membership === card.id && s.currency === card.currency) : undefined;
    const fee = charged ? charged.yearly : Number(card.annual_fee ?? 0);
    if (fee <= 0) {
      // No fee: nothing to set against, but perks to turn on still matter.
      if (setup.length) out.push({ userCardId: uc.id, name, kind: card.kind, fee: 0, feeFrom: 'catalog', currency: card.currency, creditsUsed: 0, memberSavings: 0, savingsReceipts: 0, gotBack: 0, creditsLeft: 0, setup });
      continue;
    }

    // Credits used this year, in the card's currency.
    const oppIds = new Set(d.opportunities.filter((o) => o.user_card_id === uc.id && o.type === 'card_credit').map((o) => o.id));
    const creditsUsed = d.recovered
      .filter((r) => r.opportunity_id && oppIds.has(r.opportunity_id) && thisYear(r.recovered_at) && r.currency === card.currency)
      .reduce((n, r) => n + Number(r.amount), 0);

    // Member savings on receipts this year.
    let memberSavings = 0;
    let savingsReceipts = 0;
    const line = SAVINGS_LINE[card.id];
    if (card.kind === 'membership' && line) {
      for (const r of d.receipts) {
        if (!thisYear(r.purchase_date) || r.currency !== card.currency) continue;
        const saved = (r.discounts ?? []).filter((x) => x.amount !== null && x.amount > 0 && line.test(x.description));
        if (!saved.length) continue;
        memberSavings += saved.reduce((n, x) => n + x.amount!, 0);
        savingsReceipts += 1;
      }
    }

    // Credits left this year: what's open now, plus calendar periods still to come.
    let creditsLeft = 0;
    for (const o of d.opportunities) {
      if (o.user_card_id !== uc.id || o.type !== 'card_credit' || o.status !== 'open' || o.value_estimate === null || o.currency !== card.currency) continue;
      if (o.expires_at && new Date(o.expires_at).getTime() <= now.getTime()) continue;
      const back = d.recovered.filter((r) => r.opportunity_id === o.id).reduce((n, r) => n + Number(r.amount), 0);
      creditsLeft += Math.max(0, Number(o.value_estimate) - back);
    }
    for (const b of mine) {
      if (b.type !== 'credit' || b.amount === null || b.period_anchor !== 'calendar' || (b.currency ?? card.currency) !== card.currency) continue;
      creditsLeft += Number(b.amount) * periodsLeftAfterNow(b.period, now);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    out.push({
      userCardId: uc.id,
      name,
      kind: card.kind,
      fee: round(fee),
      feeFrom: charged ? 'receipts' : 'catalog',
      currency: card.currency,
      creditsUsed: round(creditsUsed),
      memberSavings: round(memberSavings),
      savingsReceipts,
      gotBack: round(creditsUsed + memberSavings),
      creditsLeft: round(creditsLeft),
      setup,
    });
  }
  // Biggest fee first: that's where unused value costs most.
  return out.sort((a, b) => b.fee - a.fee);
}

/** All perks to turn on, across cards and memberships. */
export const allSetup = (list: PaidFor[]): SetupItem[] => list.flatMap((p) => p.setup);

/** Fees and what came back, per currency, for a summary line. */
export function paidForTotals(list: PaidFor[]): { fees: MoneyBag; gotBack: MoneyBag } {
  const fees: MoneyBag = {};
  const gotBack: MoneyBag = {};
  for (const p of list) {
    if (p.fee <= 0) continue;
    addToBag(fees, p.currency, p.fee);
    addToBag(gotBack, p.currency, p.gotBack);
  }
  return { fees, gotBack };
}
