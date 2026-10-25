// Scores what the reader extracted against a hand-checked expected answer.
// Pure, so it's unit-tested; eval/run.ts calls the real model and uses this.
import { sameMerchant } from '../supabase/functions/_shared/inbox/merge.ts';
import type { ParsedEmail } from '../supabase/functions/_shared/inbox/schema.ts';

export interface ExpectedOffer {
  type: string;
  amount?: number | null;
  currency?: string | null;
  code?: string | null;
  expires_on?: string | null;
}

/** Only the fields listed are checked, so a case can focus on what matters. */
export interface Expected {
  kind: string;
  merchant?: string | null;
  receipt?: {
    total?: number | null;
    currency?: string | null;
    card_last_four?: string | null;
    alert_status?: string | null;
    purchase_type?: string;
    purchase_date?: string | null;
    warranty_months?: number | null;
  } | null;
  offers?: ExpectedOffer[];
  /** The payment card the email shows the reader holds; null = none. */
  card?: { issuer?: string; product?: string | null; last_four?: string | null } | null;
}

export interface EvalCase {
  name: string;
  /** Made up by us, or an anonymised real message the user added. */
  origin: 'synthetic' | 'real';
  source: 'email' | 'sms';
  input: { subject?: string; from?: string; date: string; text?: string; html?: string };
  expected: Expected;
}

export interface Check {
  field: string;
  ok: boolean;
  expected: unknown;
  actual: unknown;
}

const sameMoney = (a: number | null | undefined, b: number | null | undefined) =>
  (a ?? null) === null || (b ?? null) === null ? (a ?? null) === (b ?? null) : Math.abs(a! - b!) < 0.005;
const sameText = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase();

export function scoreCase(expected: Expected, actual: ParsedEmail): Check[] {
  const checks: Check[] = [];
  const check = (field: string, ok: boolean, exp: unknown, act: unknown) => checks.push({ field, ok, expected: exp, actual: act });

  check('kind', expected.kind === actual.kind, expected.kind, actual.kind);
  if (expected.merchant !== undefined) {
    const ok = expected.merchant === null ? actual.merchant === null : !!actual.merchant && sameMerchant(expected.merchant, actual.merchant);
    check('merchant', ok, expected.merchant, actual.merchant);
  }

  if (expected.receipt !== undefined) {
    const e = expected.receipt;
    const a = actual.receipt;
    if (e === null) check('receipt', a === null, null, a ? 'a receipt' : null);
    else if (!a) check('receipt', false, 'a receipt', null);
    else {
      if (e.total !== undefined) check('receipt.total', sameMoney(e.total, a.total), e.total, a.total);
      if (e.currency !== undefined) check('receipt.currency', e.currency === a.currency, e.currency, a.currency);
      if (e.card_last_four !== undefined) check('receipt.card', e.card_last_four === a.card_last_four, e.card_last_four, a.card_last_four);
      if (e.alert_status !== undefined) check('receipt.alert_status', e.alert_status === (a.alert_status ?? null), e.alert_status, a.alert_status ?? null);
      if (e.purchase_type !== undefined) check('receipt.purchase_type', e.purchase_type === a.purchase_type, e.purchase_type, a.purchase_type);
      if (e.purchase_date !== undefined) check('receipt.date', e.purchase_date === a.purchase_date, e.purchase_date, a.purchase_date);
      if (e.warranty_months !== undefined) check('receipt.warranty', e.warranty_months === (a.warranty_months ?? null), e.warranty_months, a.warranty_months ?? null);
    }
  }

  if (expected.card !== undefined) {
    const e = expected.card;
    const a = actual.card ?? null;
    if (e === null) check('card', a === null, null, a ? `${a.issuer} ${a.product ?? ''} ${a.last_four ?? ''}`.trim() : null);
    else if (!a) check('card', false, 'a card', null);
    else {
      if (e.issuer !== undefined) check('card.issuer', sameText(a.issuer, e.issuer) || (!!a.issuer && a.issuer.toLowerCase().includes(e.issuer.toLowerCase())), e.issuer, a.issuer);
      // The card's name may be written with or without the issuer in front.
      if (e.product !== undefined) check('card.product', e.product === null ? a.product === null : !!a.product && a.product.toLowerCase().includes(e.product.toLowerCase()), e.product, a.product);
      if (e.last_four !== undefined) check('card.last_four', e.last_four === a.last_four, e.last_four, a.last_four);
    }
  }

  if (expected.offers !== undefined) {
    const left = [...actual.offers];
    for (const e of expected.offers) {
      // Pair by code when there is one, otherwise by type (and amount if given).
      const i = left.findIndex((a) => (e.code ? sameText(a.code, e.code) : a.type === e.type && (e.amount === undefined || sameMoney(a.amount, e.amount))));
      const j = i >= 0 ? i : left.findIndex((a) => a.type === e.type);
      const a = j >= 0 ? left.splice(j, 1)[0]! : null;
      const label = `offer ${e.code ?? e.type}`;
      if (!a) {
        check('offers.missed', false, label, null);
        continue;
      }
      check('offers.type', a.type === e.type, e.type, a.type);
      if (e.amount !== undefined) check('offers.amount', sameMoney(e.amount, a.amount), e.amount, a.amount);
      if (e.currency !== undefined) check('offers.currency', e.currency === a.currency, e.currency, a.currency);
      if (e.code !== undefined) check('offers.code', e.code === null ? a.code === null : sameText(a.code, e.code), e.code, a.code);
      if (e.expires_on !== undefined) check('offers.expiry', e.expires_on === a.expires_on, e.expires_on, a.expires_on);
    }
    // Anything left over is an offer that isn't really there.
    for (const a of left) check('offers.extra', false, null, a.title);
  }
  return checks;
}

export interface FieldStats {
  field: string;
  right: number;
  total: number;
}

/** Per-field and per-case accuracy over a run. */
export function summarize(results: { name: string; checks: Check[] | null }[]) {
  const byField = new Map<string, FieldStats>();
  let casesRight = 0;
  for (const r of results) {
    if (r.checks && r.checks.every((c) => c.ok)) casesRight += 1;
    for (const c of r.checks ?? [{ field: 'parse_failed', ok: false, expected: null, actual: null }]) {
      const s = byField.get(c.field) ?? { field: c.field, right: 0, total: 0 };
      s.total += 1;
      if (c.ok) s.right += 1;
      byField.set(c.field, s);
    }
  }
  return {
    cases: results.length,
    casesRight,
    fields: [...byField.values()].sort((a, b) => a.right / a.total - b.right / b.total || a.field.localeCompare(b.field)),
  };
}
