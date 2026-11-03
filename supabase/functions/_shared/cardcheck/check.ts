import { norm, numbersIn } from '../scout/validate.ts';
import type { CardPage, PricePage } from './extract.ts';

// The rules the monthly card check follows before it changes anything. Pure, so every rule is tested.
//
//   - A perk is "confirmed" only when its quote is really on the bank's page.
//   - A perk is flagged "not on the page" only when it was sourced from that page and the page clearly
//     is the right one (most of the card's other perks were found on it): a teaser page or one that
//     needs JavaScript must never make perks look gone.
//   - A new perk without a dollar amount (lounge access, cell phone protection) is added with the page's
//     own words. Anything stating money (a credit, a changed amount, a new annual fee) waits for a person:
//     a quote can be right and still be read wrong, and PerkScan never invents amounts.
//   - A price is updated on its own only when the quote contains the new figure and it moved by less than
//     half or double; a bigger jump waits for a person.

export interface KnownBenefit {
  id: string;
  name: string;
  type: 'credit' | 'protection' | 'perk';
  amount: number | null;
  period: string;
  status: string;
  /** The page this benefit was verified on. */
  source_url: string | null;
}

export interface Change {
  kind: 'amount_changed' | 'amount_found' | 'new_credit' | 'not_on_page' | 'fee_changed';
  benefitId: string | null;
  summary: string;
  current: Record<string, unknown> | null;
  proposed: Record<string, unknown> | null;
  evidence: string | null;
  dedupeKey: string;
}

export interface NewPerk {
  slug: string;
  name: string;
  type: 'protection' | 'perk';
  terms: string;
  evidence: string;
}

export interface CardCheck {
  confirmed: { id: string; evidence: string }[];
  notOnPage: string[];
  changes: Change[];
  newPerks: NewPerk[];
  /** False when too few known perks were found to trust the page (nothing is flagged missing then). */
  pageTrusted: boolean;
}

const MONEY = /[$€£]\s?\d|\b\d+(?:\.\d+)?\s?(?:dollars?|usd|ttd)\b/i;
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
const hasNumber = (text: string, n: number) => numbersIn(text).some((x) => same(x, n));

/** The quote is on the page, word for word (after normalizing quotes, dashes and spaces). */
export const quoteOn = (page: string, q: string) => {
  const n = norm(q);
  return n.length >= 12 && q.length <= 500 && page.includes(n);
};

/** Same page, ignoring the trailing slash, query and fragment. */
export const samePage = (a: string | null, b: string | null) => {
  const clean = (u: string | null) => (u ?? '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  return !!a && !!b && clean(a) === clean(b);
};

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'on', 'for', 'to', 'with', 'your', 'card', 'credit', 'free', 'access', 'benefit', 'benefits', 'up']);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
/** A perk with mostly the same words as one already listed is the same perk. */
export function similarName(a: string, b: string): boolean {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.min(x.size, y.size) >= 0.5;
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'perk';

export function checkCardPage(
  found: CardPage,
  ctx: { page: string; pageUrl: string; card: { id: string; annual_fee: number | null }; known: KnownBenefit[]; currency: string },
): CardCheck {
  const page = norm(ctx.page);
  const out: CardCheck = { confirmed: [], notOnPage: [], changes: [], newPerks: [], pageTrusted: false };
  const known = new Map(ctx.known.map((b) => [b.id, b]));
  const money = (n: number) => `${ctx.currency === 'USD' ? '$' : `${ctx.currency} `}${n}`;

  // Known perks the page states, word for word.
  for (const k of found.known) {
    const b = known.get(k.id);
    if (!b || !k.on_page || !quoteOn(page, k.evidence)) continue;
    out.confirmed.push({ id: b.id, evidence: k.evidence.trim() });
    if (k.amount === null || !hasNumber(k.evidence, k.amount)) continue;
    if (b.amount !== null && !same(b.amount, k.amount)) {
      out.changes.push({
        kind: 'amount_changed',
        benefitId: b.id,
        summary: `${b.name}: ${money(b.amount)} → ${money(k.amount)} (${b.period})`,
        current: { amount: b.amount, period: b.period },
        proposed: { amount: k.amount },
        evidence: k.evidence.trim(),
        dedupeKey: `amount:${b.id}:${k.amount}`,
      });
    } else if (b.amount === null && b.type === 'credit') {
      out.changes.push({
        kind: 'amount_found',
        benefitId: b.id,
        summary: `${b.name}: the page states ${money(k.amount)}`,
        current: { amount: null, period: b.period },
        proposed: { amount: k.amount },
        evidence: k.evidence.trim(),
        dedupeKey: `amount:${b.id}:${k.amount}`,
      });
    }
  }

  // Missing perks: only those verified on this very page, and only when the page is clearly the right one.
  const fromHere = ctx.known.filter((b) => b.status === 'active' && samePage(b.source_url, ctx.pageUrl));
  const confirmedIds = new Set(out.confirmed.map((c) => c.id));
  const foundHere = fromHere.filter((b) => confirmedIds.has(b.id)).length;
  out.pageTrusted = fromHere.length > 0 ? foundHere / fromHere.length >= 0.5 : out.confirmed.length >= 2;
  if (out.pageTrusted) {
    for (const b of fromHere) {
      if (confirmedIds.has(b.id)) continue;
      out.notOnPage.push(b.id);
      out.changes.push({ kind: 'not_on_page', benefitId: b.id, summary: `${b.name}: not found on the bank's page`, current: { name: b.name }, proposed: null, evidence: null, dedupeKey: `gone:${b.id}` });
    }
  }

  // New perks the page states that the catalog doesn't have.
  const names = ctx.known.map((b) => b.name);
  for (const n of found.new_benefits.slice(0, 8)) {
    const name = n.name.replace(/\s+/g, ' ').trim().slice(0, 80);
    const evidence = n.evidence.replace(/\s+/g, ' ').trim();
    if (name.length < 3 || !quoteOn(page, evidence)) continue;
    if (!numbersIn(name).every((x) => hasNumber(evidence, x))) continue;
    if (names.some((m) => similarName(m, name))) continue;
    names.push(name);
    const statesMoney = n.type === 'credit' || n.amount !== null || MONEY.test(name);
    if (statesMoney) {
      if (n.amount === null || !hasNumber(evidence, n.amount)) continue;
      out.changes.push({
        kind: 'new_credit',
        benefitId: null,
        summary: `New: ${name}`,
        current: null,
        proposed: { name, type: n.type, amount: n.amount, period: n.period ?? 'per_claim' },
        evidence,
        dedupeKey: `new:${ctx.card.id}:${slugify(name)}`,
      });
    } else if (out.newPerks.length < 5) {
      out.newPerks.push({ slug: slugify(name), name, type: n.type === 'protection' ? 'protection' : 'perk', terms: evidence.slice(0, 300), evidence });
    }
  }

  // The annual fee.
  const fee = found.annual_fee;
  if (fee && fee.amount !== null && quoteOn(page, fee.evidence) && (hasNumber(fee.evidence, fee.amount) || (fee.amount === 0 && /no annual fee|\$0 annual/i.test(fee.evidence)))) {
    if (ctx.card.annual_fee === null || !same(ctx.card.annual_fee, fee.amount)) {
      out.changes.push({
        kind: 'fee_changed',
        benefitId: null,
        summary: `Annual fee: ${ctx.card.annual_fee === null ? 'unconfirmed' : money(ctx.card.annual_fee)} → ${money(fee.amount)}`,
        current: { annual_fee: ctx.card.annual_fee },
        proposed: { annual_fee: fee.amount },
        evidence: fee.evidence.trim(),
        dedupeKey: `fee:${ctx.card.id}:${fee.amount}`,
      });
    }
  }
  return out;
}

export type PriceCheck =
  | { result: 'confirmed'; evidence: string }
  | { result: 'updated'; amount: number; evidence: string }
  | { result: 'changed'; amount: number; evidence: string }
  | { result: 'not_on_page'; reason: string };

export function checkPricePage(found: PricePage, ctx: { page: string; price: { amount: number; currency: string } }): PriceCheck {
  const evidence = found.evidence.replace(/\s+/g, ' ').trim();
  if (found.amount === null || found.amount <= 0) return { result: 'not_on_page', reason: 'no price on the page' };
  if (!quoteOn(norm(ctx.page), evidence)) return { result: 'not_on_page', reason: 'quote not on the page' };
  if (!hasNumber(evidence, found.amount)) return { result: 'not_on_page', reason: 'price not in the quote' };
  if (found.currency && found.currency.toUpperCase() !== ctx.price.currency) return { result: 'not_on_page', reason: `price in ${found.currency}` };
  if (same(found.amount, ctx.price.amount)) return { result: 'confirmed', evidence };
  const ratio = found.amount / ctx.price.amount;
  return ratio >= 0.5 && ratio <= 2 ? { result: 'updated', amount: found.amount, evidence } : { result: 'changed', amount: found.amount, evidence };
}
