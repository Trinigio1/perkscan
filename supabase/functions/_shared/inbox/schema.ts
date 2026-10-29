import { z } from 'zod';

// What the model must return for every email. Kept flat and nullable-heavy: the
// structured-output JSON schema doesn't support numeric/string limits, so ranges
// and formats are enforced afterwards in normalizeParsed().

/** What an email's store or offer is about. The same ids as the app's interests (src/domain/deals.ts). */
export const INTEREST_IDS = [
  'groceries', 'dining', 'delivery', 'electronics', 'fashion', 'home', 'travel', 'beauty', 'fitness', 'entertainment', 'fuel', 'kids',
  'pets', 'education', 'shopping',
] as const;

export const OFFER_TYPES = ['promo', 'gift_card', 'store_credit', 'points', 'free_trial', 'settlement', 'refund', 'travel_credit', 'certificate'] as const;

export const PURCHASE_TYPES = [
  'electronics', 'appliance', 'phone', 'clothing', 'other_goods',
  'phone_bill', 'flight', 'car_rental', 'hotel', 'travel_other',
  'food_delivery', 'rideshare', 'restaurant', 'groceries', 'subscription', 'service', 'other',
] as const;
export type PurchaseType = (typeof PURCHASE_TYPES)[number];

const CURRENCY = z.string().nullable().describe('ISO currency code of the amounts, e.g. USD or TTD');

const WHERE_HELP =
  'Where the offer can be used, if the email limits it: named restaurants or stores ("ALDI", "Shake Shack, Chipotle"), a kind of store ("Grocery and convenience stores"), or "Participating restaurants" when it says only some qualify. Null if it works everywhere or the email doesn\'t say';
const FIRST_ORDER_HELP = 'True if only for a first order or new customers, false if the email says any order, null if not stated';

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
  claim_url: z.string().nullable().describe('Official claim site for settlements, or the refund request page, only if present in the email'),
  details: z.string().nullable().describe('One short sentence of important conditions'),
  after_cancellation: z
    .boolean()
    .nullable()
    .optional() // replies stored before travel credits were read leave it out
    .describe('travel_credit only: true if the email says the credit was issued because the airline cancelled or significantly changed the flight'),
  valid_at: z
    .string()
    .nullable()
    .optional() // replies stored before this was read leave it out
    .describe(WHERE_HELP),
  first_order_only: z.boolean().nullable().optional().describe(FIRST_ORDER_HELP),
});

/** A payment card the email shows the reader holds: a statement, payment notice, card alert or benefits email. */
export const CardSeenSchema = z.object({
  issuer: z.string().nullable().describe('The bank or card company, e.g. "Chase", "American Express", "Capital One"'),
  product: z.string().nullable().describe('The card\'s name exactly as written, e.g. "Freedom Unlimited", "Platinum Card", "Venture X". Null if not named'),
  last_four: z.string().nullable().describe('Only the last 4 digits shown, e.g. "ending in 1234" -> "1234"'),
});

export const ALERT_STATUSES = ['approved', 'pending', 'declined', 'reversed'] as const;

/** A code, gift card, store credit or reward taken off the total on a receipt. */
export const DiscountSchema = z.object({
  description: z.string().describe('The line as written, e.g. "Promo code EATS25", "Kohl\'s Cash", "Gift card", "Uber One savings"'),
  code: z.string().nullable().describe('The promo code if the receipt shows one, else null'),
  amount: z.number().nullable().describe('The amount taken off, as a positive number'),
});
const DISCOUNTS_HELP = 'Every promo code, coupon, gift card, store credit, reward or membership saving applied on this receipt; empty if none';

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
  warranty_months: z
    .number()
    .nullable()
    .optional() // replies stored before warranties were read leave it out
    .describe('Warranty length in months, only if the receipt states one (e.g. "2-year warranty" -> 24)'),
  items: z.array(z.object({ name: z.string(), price: z.number().nullable(), quantity: z.number().nullable() })),
  alert_status: z
    .string()
    .nullable()
    .optional() // older stored replies and store receipts may leave it out
    .describe('Only for bank card alerts: approved, pending (an authorization), declined, or reversed (refund/reversal). Null for store receipts'),
  discounts: z
    .array(DiscountSchema)
    .optional() // replies stored before discounts were read leave it out
    .describe(DISCOUNTS_HELP),
});

/** A flight the email says was cancelled, delayed or changed: what the passenger-rights rules need. */
export const FlightSchema = z.object({
  status: z.string().nullable().describe('cancelled, delayed, or schedule_change (the airline moved the time); null if none of these'),
  delay_minutes: z.number().nullable().describe('How late it arrives (or the new time minus the old), in minutes, if stated'),
  airline: z.string().nullable(),
  airline_country: z.string().nullable().describe('2-letter country of the airline, e.g. US for American, DE for Lufthansa, TT for Caribbean Airlines'),
  flight_number: z.string().nullable().describe('e.g. "BW 484"'),
  flight_date: z.string().nullable().describe('YYYY-MM-DD scheduled departure'),
  from_country: z.string().nullable().describe('2-letter country of the departure airport'),
  to_country: z.string().nullable().describe('2-letter country of the arrival airport'),
  booking_ref: z.string().nullable().describe('Booking / confirmation code, if shown'),
  accepted_alternative: z.boolean().nullable().describe('True if the email says the reader already accepted a rebooking, credit or voucher'),
});
const FLIGHT_HELP = 'Only when the email says a flight was cancelled, delayed or its schedule changed; else null';

export const KINDS = ['receipt', 'card_alert', 'promo', 'gift_card_or_store_credit', 'loyalty', 'trial_or_subscription', 'settlement', 'other'] as const;

export const ParsedEmailSchema = z.object({
  kind: z.enum(KINDS),
  merchant: z.string().nullable().describe('Store or brand name'),
  summary: z.string().describe('Under 100 characters, no personal details'),
  receipt: ReceiptSchema.nullable().describe('For purchase receipts, order confirmations and bank card purchase alerts'),
  offers: z.array(OfferSchema).describe('Every distinct offer, credit, code, trial or settlement in the email; empty if none'),
  card: CardSeenSchema.nullable()
    .optional() // replies stored before cards were read leave it out
    .describe('Only when the email is from a bank or card issuer about the reader\'s own credit or charge card'),
  membership: z
    .string()
    .nullable()
    .optional() // replies stored before memberships were read leave it out
    .describe('A paid membership the email shows the reader has (it addresses them as a member or lists their member benefits), e.g. "Uber One", "Amazon Prime". Null for ads inviting them to join'),
  // A plain string, not an enum: checked against INTEREST_IDS in normalizeParsed (see ModelOutputSchema).
  interest: z
    .string()
    .nullable()
    .optional() // replies stored before interests were read leave it out
    .describe('What the store or offer is mainly about, e.g. a gym -> fitness, Sephora -> beauty. Null for banks, bills and anything that fits none'),
  flight: FlightSchema.nullable()
    .optional() // replies stored before flights were read leave it out
    .describe(FLIGHT_HELP),
});

/**
 * The shape the model is asked to produce: the same fields, all required (nullable instead of
 * optional) and with as few enums as possible. Optional fields and long enums make the compiled
 * structured-output grammar too large for the API ("The compiled grammar is too large"). Replies
 * are still validated with ParsedEmailSchema, which this always satisfies.
 */
export const ModelOutputSchema = ParsedEmailSchema.extend({
  receipt: ReceiptSchema.extend({
    warranty_months: z.number().nullable().describe('Warranty length in months, only if the receipt states one (e.g. "2-year warranty" -> 24)'),
    alert_status: z.string().nullable().describe('Only for bank card alerts: approved, pending (an authorization), declined, or reversed (refund/reversal). Null for store receipts'),
    discounts: z.array(DiscountSchema).describe(DISCOUNTS_HELP),
  })
    .nullable()
    .describe('For purchase receipts, order confirmations and bank card purchase alerts'),
  offers: z
    .array(
      OfferSchema.extend({
        after_cancellation: z.boolean().nullable().describe('travel_credit only: true if the email says the credit was issued because the airline cancelled or significantly changed the flight'),
        valid_at: z.string().nullable().describe(WHERE_HELP),
        first_order_only: z.boolean().nullable().describe(FIRST_ORDER_HELP),
      }),
    )
    .describe('Every distinct offer, credit, code, trial or settlement in the email; empty if none'),
  card: CardSeenSchema.nullable().describe('Only when the email is from a bank or card issuer about the reader\'s own credit or charge card'),
  membership: z.string().nullable().describe('A paid membership the email shows the reader has (it addresses them as a member or lists their member benefits), e.g. "Uber One", "Amazon Prime". Null for ads inviting them to join'),
  flight: FlightSchema.nullable().describe(FLIGHT_HELP),
  interest: z
    .string()
    .nullable()
    .describe(`What the store or offer is mainly about, one of: ${INTEREST_IDS.join(', ')}. Null for banks, bills and anything that fits none`),
});

export type ParsedEmail = z.infer<typeof ParsedEmailSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type CardSeen = z.infer<typeof CardSeenSchema>;

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

const country2 = (c: string | null | undefined) => (c && /^[A-Za-z]{2}$/.test(c.trim()) ? c.trim().toUpperCase() : null);

/** A flight disruption, or null when it isn't one the rules can use. */
function normalizeFlight(f: z.infer<typeof FlightSchema> | null): z.infer<typeof FlightSchema> | null {
  if (!f || !['cancelled', 'delayed', 'schedule_change'].includes(f.status ?? '')) return null;
  return {
    status: f.status,
    delay_minutes: f.delay_minutes !== null && f.delay_minutes > 0 && f.delay_minutes < 7 * 24 * 60 ? Math.round(f.delay_minutes) : null,
    airline: text(f.airline, 60),
    airline_country: country2(f.airline_country),
    flight_number: text(f.flight_number, 12),
    flight_date: date(f.flight_date),
    from_country: country2(f.from_country),
    to_country: country2(f.to_country),
    booking_ref: text(f.booking_ref, 20),
    accepted_alternative: typeof f.accepted_alternative === 'boolean' ? f.accepted_alternative : null,
  };
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
          alert_status: (ALERT_STATUSES as readonly string[]).includes(p.receipt.alert_status ?? '') ? (p.receipt.alert_status as (typeof ALERT_STATUSES)[number]) : null,
          warranty_months:
            p.receipt.warranty_months != null && p.receipt.warranty_months > 0 && p.receipt.warranty_months <= 120
              ? Math.round(p.receipt.warranty_months)
              : null,
          items: p.receipt.items.slice(0, 50).map((i) => ({
            name: text(i.name, 120) ?? 'Item',
            price: money(i.price),
            quantity: i.quantity !== null && i.quantity > 0 && i.quantity < 1000 ? Math.round(i.quantity) : null,
          })),
          discounts: (p.receipt.discounts ?? [])
            .slice(0, 10)
            .map((d) => ({
              description: text(d.description, 80) ?? 'Discount',
              code: d.code && /^[A-Za-z0-9-]{3,40}$/.test(d.code.trim()) ? d.code.trim() : null,
              // Some receipts write discounts as negative amounts ("-$6.20").
              amount: money(d.amount === null ? null : Math.abs(d.amount)),
            }))
            .filter((d) => d.amount !== null || d.code !== null),
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
      after_cancellation: o.type === 'travel_credit' ? o.after_cancellation ?? null : null,
      valid_at: text(o.valid_at ?? null, 120),
      first_order_only: typeof o.first_order_only === 'boolean' ? o.first_order_only : null,
    })),
    card: normalizeCard(p.card ?? null),
    interest: p.interest && (INTEREST_IDS as readonly string[]).includes(p.interest) ? p.interest : null,
    membership: text(p.membership ?? null, 60),
    flight: normalizeFlight(p.flight ?? null),
  };
}

/** A card worth remembering needs an issuer and either a name or its last 4 digits. Never more. */
function normalizeCard(c: CardSeen | null): CardSeen | null {
  if (!c) return null;
  const issuer = text(c.issuer, 60);
  const product = text(c.product?.replace(/[®™℠]/g, '') ?? null, 80);
  const lastFour = c.last_four && /^\d{4}$/.test(c.last_four.trim()) ? c.last_four.trim() : null;
  if (!issuer || (!product && !lastFour)) return null;
  return { issuer, product, last_four: lastFour };
}
