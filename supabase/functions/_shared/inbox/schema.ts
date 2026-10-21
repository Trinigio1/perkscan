import { z } from 'zod';

// What the model must return for every email. Kept flat and nullable-heavy: the
// structured-output JSON schema doesn't support numeric/string limits, so ranges
// and formats are enforced afterwards in normalizeParsed().

export const OFFER_TYPES = ['promo', 'gift_card', 'store_credit', 'points', 'free_trial', 'settlement'] as const;

export const PURCHASE_TYPES = [
  'electronics', 'appliance', 'phone', 'clothing', 'other_goods',
  'phone_bill', 'flight', 'car_rental', 'hotel', 'travel_other',
  'food_delivery', 'rideshare', 'restaurant', 'groceries', 'subscription', 'service', 'other',
] as const;
export type PurchaseType = (typeof PURCHASE_TYPES)[number];

const CURRENCY = z.string().nullable().describe('ISO currency code of the amounts, e.g. USD or TTD');

export const OfferSchema = z.object({
  type: z.enum(OFFER_TYPES),
  currency: CURRENCY,
  title: z.string().describe('Short headline, e.g. "20% off your next order" or "$25 store credit"'),
  amount: z.number().nullable().describe('Dollar value if stated (credit/discount/settlement amount; for trials, the price after the trial)'),
  percent_off: z.number().nullable(),
  code: z.string().nullable().describe('Promo or gift card code exactly as written, if any'),
  expires_on: z.string().nullable().describe('YYYY-MM-DD; resolve relative dates against the email date'),
  min_spend: z.number().nullable(),
  points: z.number().nullable().describe('Points/miles quantity for loyalty offers'),
  claim_url: z.string().nullable().describe('Official claim site for settlements, only if present in the email'),
  details: z.string().nullable().describe('One short sentence of important conditions'),
});

export const ALERT_STATUSES = ['approved', 'pending', 'declined', 'reversed'] as const;

export const ReceiptSchema = z.object({
  total: z.number().nullable(),
  currency: CURRENCY,
  purchase_type: z.enum(PURCHASE_TYPES).describe('What was mainly bought. phone = a phone/device itself; phone_bill = a mobile plan payment'),
  travel_date: z.string().nullable().describe('YYYY-MM-DD departure or pick-up date for flights, car rentals and hotels'),
  purchase_date: z.string().nullable().describe('YYYY-MM-DD'),
  card_last_four: z.string().nullable().describe('Only if the email shows the last 4 digits of the payment card'),
  order_number: z.string().nullable(),
  return_by: z.string().nullable().describe('YYYY-MM-DD if a return deadline is stated'),
  return_window_days: z.number().nullable().describe('Return window length in days if stated instead of a date'),
  items: z.array(z.object({ name: z.string(), price: z.number().nullable(), quantity: z.number().nullable() })),
  alert_status: z
    .enum(ALERT_STATUSES)
    .nullable()
    .optional() // older stored replies and store receipts may leave it out
    .describe('Only for bank card alerts: approved, pending (an authorization), declined, or reversed (refund/reversal). Null for store receipts'),
});

export const KINDS = ['receipt', 'card_alert', 'promo', 'gift_card_or_store_credit', 'loyalty', 'trial_or_subscription', 'settlement', 'other'] as const;

export const ParsedEmailSchema = z.object({
  kind: z.enum(KINDS),
  merchant: z.string().nullable().describe('Store or brand name'),
  summary: z.string().describe('Under 100 characters, no personal details'),
  receipt: ReceiptSchema.nullable().describe('For purchase receipts, order confirmations and bank card purchase alerts'),
  offers: z.array(OfferSchema).describe('Every distinct offer, credit, code, trial or settlement in the email; empty if none'),
});

export type ParsedEmail = z.infer<typeof ParsedEmailSchema>;
export type Offer = z.infer<typeof OfferSchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function currency(s: string | null): string | null {
  const c = s?.trim().toUpperCase() ?? '';
  // Common symbols the model might echo instead of a code.
  const bySymbol: Record<string, string> = { US$: 'USD', TT$: 'TTD', 'CA$': 'CAD', '€': 'EUR', '£': 'GBP', J$: 'JMD' };
  if (bySymbol[c]) return bySymbol[c]!;
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

function date(s: string | null): string | null {
  if (!s || !ISO_DATE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

function money(n: number | null, max = 100_000): number | null {
  if (n === null || !Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}

function text(s: string | null, max: number): string | null {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Clamps values into sane ranges and drops anything malformed rather than trusting it. */
export function normalizeParsed(p: ParsedEmail): ParsedEmail {
  return {
    kind: p.kind,
    merchant: text(p.merchant, 80),
    summary: text(p.summary, 140) ?? '',
    receipt: p.receipt
      ? {
          total: money(p.receipt.total),
          currency: currency(p.receipt.currency),
          purchase_type: p.receipt.purchase_type,
          travel_date: date(p.receipt.travel_date),
          purchase_date: date(p.receipt.purchase_date),
          card_last_four: p.receipt.card_last_four && /^\d{4}$/.test(p.receipt.card_last_four) ? p.receipt.card_last_four : null,
          order_number: text(p.receipt.order_number, 60),
          return_by: date(p.receipt.return_by),
          return_window_days:
            p.receipt.return_window_days !== null && p.receipt.return_window_days > 0 && p.receipt.return_window_days <= 365
              ? Math.round(p.receipt.return_window_days)
              : null,
          alert_status: p.receipt.alert_status ?? null,
          items: p.receipt.items.slice(0, 50).map((i) => ({
            name: text(i.name, 120) ?? 'Item',
            price: money(i.price),
            quantity: i.quantity !== null && i.quantity > 0 && i.quantity < 1000 ? Math.round(i.quantity) : null,
          })),
        }
      : null,
    offers: p.offers.slice(0, 10).map((o) => ({
      type: o.type,
      currency: currency(o.currency),
      title: text(o.title, 100) ?? 'Offer',
      amount: money(o.amount, 1_000_000),
      percent_off: o.percent_off !== null && o.percent_off > 0 && o.percent_off <= 100 ? o.percent_off : null,
      code: o.code && /^[A-Za-z0-9-]{3,40}$/.test(o.code.trim()) ? o.code.trim() : null,
      expires_on: date(o.expires_on),
      min_spend: money(o.min_spend),
      points: o.points !== null && o.points > 0 && o.points < 100_000_000 ? Math.round(o.points) : null,
      claim_url: o.claim_url && /^https:\/\/[^\s]+$/i.test(o.claim_url) ? o.claim_url.slice(0, 300) : null,
      details: text(o.details, 200),
    })),
  };
}
