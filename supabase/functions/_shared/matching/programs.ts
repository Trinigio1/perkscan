// Money that comes from the purchase itself, not the card: store price adjustments,
// warranties stated on the receipt, and charges that look like they went through twice.
// Pure: the pipeline loads the receipt, the catalog and nearby charges, then writes the rows.

import { sameMerchant } from '../merchant.ts';
import { fmtMoney } from '../inbox/opportunities.ts';
import type { PurchaseType } from '../inbox/schema.ts';

export interface PurchaseIn {
  id: string;
  kind: 'receipt' | 'card_alert';
  pending: boolean;
  merchant: string;
  total: number | null;
  currency: string;
  purchase_date: string | null;
  return_by: string | null;
  last_four: string | null;
  purchase_type: PurchaseType | null;
}

export interface PriceProgramIn {
  id: string;
  name: string;
  countries: string[];
  merchants: string[];
  /** Days after purchase; null = during the return period. */
  window_days: number | null;
  how_to: string;
  url: string;
  status: 'active' | 'TODO_VERIFY';
}

export interface ExtraRow {
  type: 'price_drop' | 'protection' | 'refund';
  title: string;
  description: string;
  merchant: string;
  code: null;
  value_estimate: null;
  currency: string;
  expires_at: string | null;
  dedupe_key: string;
  action_steps: { step: string; url?: string }[];
}

const GOODS: PurchaseType[] = ['electronics', 'appliance', 'phone', 'clothing', 'other_goods'];

/** The country a currency belongs to, so a US$ receipt from Target counts as a US purchase. */
const CURRENCY_COUNTRY: Record<string, string> = { USD: 'US', TTD: 'TT', JMD: 'JM', BBD: 'BB', BSD: 'BS', GYD: 'GY', CAD: 'CA', GBP: 'GB' };

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim()} `;
const sellsHere = (merchant: string, names: string[]) => names.some((n) => norm(merchant).includes(norm(n)));

const addDays = (d: string, days: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};
const addMonths = (d: string, months: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCMonth(t.getUTCMonth() + months);
  return t.toISOString().slice(0, 10);
};
const endOfDay = (d: string) => `${d}T23:59:59Z`;

/** The store's price adjustment policy for this purchase, if it has one and the window is still open. */
export function priceAdjustment(p: PurchaseIn, programs: PriceProgramIn[], country: string | null, today: string): ExtraRow | null {
  if (p.pending || !p.purchase_date || !p.purchase_type || !GOODS.includes(p.purchase_type)) return null;
  const where = new Set([country, CURRENCY_COUNTRY[p.currency]].filter(Boolean));
  const program = programs.find((x) => sellsHere(p.merchant, x.merchants) && (!x.countries.length || x.countries.some((c) => where.has(c))));
  if (!program) return null;
  // "During the return period" needs a known return date.
  const until = program.window_days ? addDays(p.purchase_date, program.window_days) : p.return_by;
  if (!until || until < today) return null;
  return {
    type: 'price_drop',
    title: `Price drop at ${p.merchant}? Get the difference back`,
    description: `${program.name}: ${program.window_days ? `within ${program.window_days} days of purchase` : 'during the return period'}${p.total !== null ? ` · you paid ${fmtMoney(p.total, p.currency)}` : ''}.`,
    merchant: p.merchant,
    code: null,
    value_estimate: null, // only owed if the price actually drops
    currency: p.currency,
    expires_at: endOfDay(until),
    dedupe_key: `price_adjust:${p.id}`,
    action_steps: [
      { step: `If ${p.merchant} lowers the price before ${until}, ask for the difference. Keep your receipt.` },
      { step: program.how_to },
      { step: `${program.name} terms`, url: program.url },
    ],
  };
}

/** A warranty the receipt itself states ("2-year warranty"), counted from the purchase date. */
export function statedWarranty(p: PurchaseIn, warrantyMonths: number | null, today: string): ExtraRow | null {
  if (!warrantyMonths || !p.purchase_date) return null;
  const until = addMonths(p.purchase_date, warrantyMonths);
  if (until < today) return null;
  return {
    type: 'protection',
    title: `Warranty: ${p.merchant} purchase`,
    description: `${warrantyMonths >= 12 && warrantyMonths % 12 === 0 ? `${warrantyMonths / 12}-year` : `${warrantyMonths}-month`} warranty from ${p.purchase_date}, as stated on the receipt.`,
    merchant: p.merchant,
    code: null,
    value_estimate: null,
    currency: p.currency,
    expires_at: endOfDay(until),
    dedupe_key: `warranty:${p.id}`,
    action_steps: [
      { step: 'If it breaks, contact the seller or manufacturer with your receipt before the warranty ends.' },
      { step: `Warranty ends ${until}.` },
    ],
  };
}

/**
 * Two settled card charges for the same amount at the same store, on the same card and day, are often
 * a double charge. It can also be two real purchases, so it's only ever a "check this".
 */
export function isDoubleCharge(a: PurchaseIn, b: PurchaseIn): boolean {
  return (
    a.id !== b.id &&
    a.kind === 'card_alert' &&
    b.kind === 'card_alert' &&
    !a.pending &&
    !b.pending &&
    a.total !== null &&
    a.total === b.total &&
    a.currency === b.currency &&
    !!a.last_four &&
    a.last_four === b.last_four &&
    !!a.purchase_date &&
    a.purchase_date === b.purchase_date &&
    sameMerchant(a.merchant, b.merchant)
  );
}

export function doubleChargeRow(p: PurchaseIn, rule: { how_to: string; url: string } | null): ExtraRow {
  return {
    type: 'refund',
    title: `Charged twice at ${p.merchant}?`,
    description: `Two ${fmtMoney(p.total ?? 0, p.currency)} charges on the card ending ${p.last_four} on ${p.purchase_date}.`,
    merchant: p.merchant,
    code: null,
    value_estimate: null, // it may be two real purchases
    currency: p.currency,
    expires_at: null,
    dedupe_key: `double_charge:${p.last_four}:${p.purchase_date}:${p.total}:${p.merchant.toLowerCase()}`,
    action_steps: [
      { step: 'Check your statement. If you only bought it once, call the number on the back of your card to dispute the extra charge.' },
      ...(rule ? [{ step: rule.how_to }, { step: 'Your rights', url: rule.url }] : []),
    ],
  };
}
