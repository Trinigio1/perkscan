import type { Offer, ParsedEmail, PurchaseType } from './schema.ts';

// Turns a parsed email into database rows. Pure: the caller does the writes.

export interface ReceiptRow {
  /** A store receipt, or a bank's card purchase alert (no items or return window). */
  kind: 'receipt' | 'card_alert';
  /** An authorization the bank hasn't settled yet. */
  pending: boolean;
  merchant: string;
  total: number | null;
  currency: string;
  purchase_type: PurchaseType;
  travel_date: string | null;
  purchase_date: string | null;
  last_four: string | null;
  items: { name: string; price: number | null; quantity: number | null }[];
  order_number: string | null;
  return_by: string | null;
  category: string | null;
  /** Codes, gift cards, credits and rewards applied on the receipt: how PerkScan notices you used one. */
  discounts?: { description: string; code: string | null; amount: number | null }[];
}

export interface OpportunityRow {
  type: 'promo' | 'gift_card' | 'store_credit' | 'points' | 'free_trial' | 'settlement' | 'return_window' | 'refund' | 'travel_credit' | 'certificate';
  title: string;
  description: string | null;
  merchant: string | null;
  code: string | null;
  value_estimate: number | null;
  currency: string;
  expires_at: string | null;
  dedupe_key: string;
  action_steps: { step: string; url?: string }[];
  /** What it's about ("fitness", "beauty"), so it can sit under the interests the user picked. */
  interest: string | null;
  /** "20% off" as 20, and any minimum spend: kept so the app can estimate a percent-off code. */
  percent_off: number | null;
  min_spend: number | null;
  /** "$15 off $75": the amount off when it needs a minimum spend, so it's a discount, not money you have. */
  discount_amount: number | null;
}

export interface Rows {
  receipt: ReceiptRow | null;
  opportunities: OpportunityRow[];
  /** Offers the email had that were left out, and why: for "What PerkScan read". */
  skipped: { expired: number; noValue: number; notMoney: number };
}

const slug = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';

/** End of the given day (UTC). Good enough for "use by" dates that don't state a time. */
const endOfDay = (d: string) => `${d}T23:59:59Z`;

function addDays(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

const PREFIX: Record<string, string> = { USD: 'US$', TTD: 'TT$', CAD: 'CA$', JMD: 'J$', BBD: 'Bds$', BSD: 'B$', GYD: 'G$', EUR: '€', GBP: '£' };
/** "US$25" / "TT$19.99" / "25 XYZ". */
export function fmtMoney(n: number, currency: string): string {
  const num = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const p = PREFIX[currency];
  return p ? `${p}${num}` : `${num} ${currency}`;
}

/** An official refund rule to point to, e.g. the US DOT rule for cancelled flights. */
export interface RefundRule {
  how_to: string;
  url: string;
}

function offerRow(o: Offer, merchant: string | null, currency: string, flightRefundRule: RefundRule | null, interest: string | null, store: string): OpportunityRow {
  const who = merchant ?? 'this store';
  const fmt = (n: number) => fmtMoney(n, currency);
  const steps: OpportunityRow['action_steps'] = [];
  let type: OpportunityRow['type'] = o.type;
  let value = o.amount;
  let title = o.title;

  switch (o.type) {
    case 'promo':
      if (o.code) steps.push({ step: `Enter code ${o.code} at checkout on ${who}.` });
      else steps.push({ step: `Shop at ${who} — the discount applies automatically or via the link in the email.` });
      if (o.min_spend) steps.push({ step: `Minimum spend: ${fmt(o.min_spend)}.` });
      break;
    case 'gift_card':
    case 'store_credit':
      steps.push({ step: o.code ? `Use code ${o.code} at ${who} checkout.` : `Your ${o.type === 'gift_card' ? 'gift card' : 'store credit'} is on your ${who} account.` });
      break;
    case 'points':
      // Points have no reliable dollar value; only count an explicitly stated dollar amount.
      steps.push({ step: `Redeem or keep your ${who} points active before they expire.` });
      if (o.points && !title.match(/\d/)) title = `${o.points.toLocaleString('en-US')} points`;
      break;
    case 'free_trial':
      // A trial isn't money you're owed, so it never counts toward "left on the table".
      value = null;
      title = o.title || `${who} trial ends`;
      steps.push({ step: `If you don't want it, cancel in your ${who} account before the trial ends.` });
      if (o.amount) steps.push({ step: `Otherwise you'll be charged ${fmt(o.amount)}.` });
      break;
    case 'refund':
      steps.push({ step: `Ask ${who} for it as the email describes — don't accept a voucher if you'd rather have the money back.` });
      if (o.claim_url) steps.push({ step: 'Where to claim', url: o.claim_url });
      break;
    case 'travel_credit':
      // Already yours: it counts, like store credit.
      steps.push({ step: `Use it when you book with ${who}: it shows up at checkout or in your ${who} account.` });
      if (o.code) steps.push({ step: `Credit or voucher number: ${o.code}.` });
      if (o.after_cancellation && flightRefundRule) {
        steps.push({
          step: `${who} cancelled or changed your flight. If you didn't choose this credit, US rules say you may be owed a cash refund instead. ${flightRefundRule.how_to}`,
          url: flightRefundRule.url,
        });
      }
      break;
    case 'certificate':
      // A free night or companion fare has no dollar value unless one is stated.
      steps.push({ step: `Book with ${who} before it expires. Look for it under rewards or certificates in your ${who} account.` });
      break;
    case 'settlement':
      type = 'settlement';
      steps.push({ step: 'Check eligibility and file on the official settlement site. PerkScan never files on your behalf.' });
      if (o.claim_url) steps.push({ step: 'Official claim site', url: o.claim_url });
      break;
  }
  if (o.expires_on) steps.push({ step: `Expires ${o.expires_on}.` });

  // A ceiling or a trade-in isn't money owed: keep the item if it has a code or deadline, never its amount.
  if (notMoneyOwed(o)) value = null;
  // "Spend $75, save $15": a discount on spending more, not money you have. Kept as a discount (the
  // app estimates it against what you usually spend there), never in Ready to use.
  const minSpend = o.min_spend ?? spendFloor(o);
  const discount = o.type === 'promo' && value !== null && minSpend !== null ? value : null;
  if (discount !== null) value = null;
  const description = [o.percent_off ? `${o.percent_off}% off` : null, o.details].filter(Boolean).join(' · ') || null;
  return {
    type,
    title,
    description,
    merchant,
    code: o.code,
    value_estimate: value,
    currency,
    expires_at: o.expires_on ? endOfDay(o.expires_on) : null,
    dedupe_key: `${type}:${store}:${o.code ? slug(o.code) : offerWords(o)}:${o.expires_on ?? ''}`,
    action_steps: steps,
    interest,
    percent_off: o.percent_off,
    min_spend: minSpend,
    discount_amount: discount,
  };
}

/** "Spend $75, save $15", "$5 off orders over $20": the minimum spend written in the title. */
export function spendFloor(o: Pick<Offer, 'title' | 'details'>): number | null {
  const m = /\b(?:spend|orders? (?:of|over)|on|minimum(?: purchase)?(?: of)?)\s*(?:[A-Z]{3}\s?)?[$€£]?\s?(\d+(?:\.\d\d)?)\s*\+?/i.exec(`${o.title} ${o.details ?? ''}`);
  const n = m ? Number(m[1]) : NaN;
  return n > 0 ? n : null;
}

/** "60 EUR off", "€30 off", "£10": a currency the offer itself states, over the email's default. */
export function currencyIn(o: Pick<Offer, 'title' | 'details'>): string | null {
  const t = `${o.title} ${o.details ?? ''}`;
  if (/€|\bEUR\b/.test(t)) return 'EUR';
  if (/£|\bGBP\b/.test(t)) return 'GBP';
  if (/\bTT\$|\bTTD\b/.test(t)) return 'TTD';
  if (/\bCA\$|\bCAD\b/.test(t)) return 'CAD';
  return null;
}

/** Mail services and inboxes that send for many stores: their domain says nothing about the store. */
const SHARED_SENDERS = new Set(['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'klaviyomail', 'klaviyo', 'mailchimp', 'sendgrid', 'amazonses', 'shopify', 'shopifyemail', 'zendesk', 'example']);

/** One key per store: from the sender's domain ("email.uber.com" -> "uber"), else the merchant's name. */
export function storeOf(fromDomain: string | null, merchant: string | null): string {
  const parts = (fromDomain ?? '').toLowerCase().split('.').filter(Boolean);
  if (parts.length >= 2) {
    const cc = parts.length >= 3 && parts[parts.length - 1]!.length === 2 && ['co', 'com', 'net', 'org'].includes(parts[parts.length - 2]!);
    const name = parts[parts.length - (cc ? 3 : 2)]!.replace(/-mail$|mail$/, '');
    if (name.length >= 3 && !SHARED_SENDERS.has(name)) return slug(name);
  }
  return slug(merchant);
}

/** At most this many in-app deals from one email: a newsletter can list a dozen. */
const MAX_IN_APP = 3;
/** How long an in-app deal seen in email is shown. Stores rotate these about weekly. */
const IN_APP_DAYS = 7;

/** A concrete deal with nothing to enter and no stated end: buy one get one, a free item, a set amount off. */
export function inAppDeal(o: Pick<Offer, 'type' | 'title'>, merchant: string | null): boolean {
  return o.type === 'promo' && !!merchant && /\b(buy (one|1),? get (one|1)|bogo|free (item|entr[ée]e|side|drink|dessert|delivery|appetizer|fries|chips|guac|cookie|coffee)|\$\d+(\.\d\d)? off)\b/i.test(o.title);
}

/** Monday of the week, so the same in-app deal seen again next week is shown again, not merged forever. */
function weekOf(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

function inAppRow(o: Offer, merchant: string, currency: string, sentOn: string, interest: string | null, store: string): OpportunityRow {
  return {
    type: 'promo',
    title: o.title,
    description: o.details,
    merchant,
    code: null,
    value_estimate: null, // never money: it may be gone by the time you look
    currency,
    // Not a real deadline: when PerkScan stops showing it. The app labels these "seen in your email".
    expires_at: endOfDay(addDays(sentOn, IN_APP_DAYS)),
    dedupe_key: `inapp:${store}:${offerWords(o)}:${weekOf(sentOn)}`,
    action_steps: [
      { step: `Seen in a ${merchant} email on ${sentOn}. It's applied in the ${merchant} app or site, no code needed.` },
      { step: 'Deals like this change about weekly, so check it is still there before you order.' },
    ],
    interest,
    percent_off: o.percent_off,
    min_spend: o.min_spend,
    discount_amount: null,
  };
}

// Words that don't tell two offers from the same store apart.
const SAME_OFFER_FILLER = new Set([
  'off', 'your', 'next', 'order', 'orders', 'select', 'selected', 'every', 'on', 'the', 'a', 'an', 'for', 'with', 'of', 'at', 'to',
  'and', 'or', 'get', 'save', 'savings', 'member', 'members', 'only', 'new', 'all', 'this', 'week', 'weekly', 'today', 'now', 'your',
  'uber', 'one', 'eats', 'deal', 'deals', 'offer', 'promo', 'code', 'when', 'you', 'spend', 'up', 'more', 'than', 'over',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'mondays', 'tuesdays', 'wednesdays', 'thursdays',
  'fridays', 'saturdays', 'sundays', 'weekend', 'weekends',
]);

/**
 * What an offer without a code is, for spotting the same offer worded differently in later emails:
 * "30% off select fresh groceries every Tuesday (Uber One)" and "30% off select fresh groceries on
 * Tuesdays" are one offer. Its amount or percent, plus its distinctive words. Exported for tests.
 */
export function offerWords(o: Pick<Offer, 'title' | 'amount' | 'percent_off'>): string {
  const words = [...new Set(
    o.title
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !SAME_OFFER_FILLER.has(w))
      .map((w) => (w.length > 3 ? w.replace(/(ies|es|s)$/, '') : w)),
  )].sort().slice(0, 5);
  const value = o.amount !== null ? `${o.amount}` : o.percent_off !== null ? `${o.percent_off}pct` : '';
  return slug([value, ...words].filter(Boolean).join('-'));
}

/**
 * "Up to $1,200 when you trade in", "up to 50% off": a ceiling or a swap, not money the user has.
 * Never counted, whatever the model returned. Exported for tests.
 */
export function notMoneyOwed(o: Pick<Offer, 'title' | 'details'>): boolean {
  const text = `${o.title} ${o.details ?? ''}`;
  return /\btrade[- ]?in\b|\bup to\b|\bfinanc(e|ing)\b|\bsweepstakes\b|\bchance to win\b/i.test(text) || earnedByDoing(o) || isPrice(o);
}

const MONEY_WORDS = /\b(off|credit|back|save|saving|savings|free|reward|cash|gift ?card|voucher|refund|payout|discount)\b/i;

/** "Broadway's Beaches for $59", "plans from $9.99": a price you'd pay, not money you have. */
export function isPrice(o: Pick<Offer, 'title' | 'details'>): boolean {
  return /\b(for|from|starting at|only|just|now)\s+(US)?\$\s?\d/i.test(o.title) && !MONEY_WORDS.test(o.title);
}

/** "$100 gift card for a case study interview", "$20 off after 5 tasks": paid for doing something, not owed. */
export function earnedByDoing(o: Pick<Offer, 'title' | 'details'>): boolean {
  return /\b(interview|survey|focus group|research study|complet(e|ing) \d+ (tasks?|orders?|trips?|rides?)|unlock by|referrals?|refer (a )?friends?|invite (a )?friends?|spread the love|give \$\d+[^.]{0,20}get \$\d+|when (a |your )?friends? (joins?|signs? up|buys?|orders?))\b/i.test(`${o.title} ${o.details ?? ''}`);
}

/**
 * Not a perk at all, so not shown: applying for a card or account ("Apply for Robinhood Gold Card"),
 * being paid for an interview or survey, or a discount for signing up to texts or emails.
 */
export function notAPerk(o: Pick<Offer, 'title' | 'details'>): boolean {
  const text = `${o.title} ${o.details ?? ''}`;
  return (
    /\b(apply|applying|application)\b|\bopen (a |an )?(new )?(account|card)\b|\bget approved\b/i.test(o.title) ||
    /\b(interview|survey|focus group|research study|case study)\b/i.test(text) ||
    /\b(sign(ing)? up|connect|subscrib(e|ing)|opt(ing)? in|join)\b[^.]{0,25}\b(texts?|sms|text messages|emails?|newsletter)\b/i.test(o.title)
  );
}

/** A trade-in offer: never money the user has, and not worth showing. */
const isTradeIn = (o: Pick<Offer, 'title' | 'details'>) => /\btrade[- ]?in\b/i.test(`${o.title} ${o.details ?? ''}`);

/** Offers with no value, code, points or deadline are marketing noise. */
function isActionable(o: Offer): boolean {
  return o.amount !== null || o.percent_off !== null || o.code !== null || o.points !== null || o.expires_on !== null || freeWithLink(o);
}

/** "Free Microsoft 365 for students" with the official page to claim it: worth keeping without a date. */
const freeWithLink = (o: Pick<Offer, 'title' | 'claim_url'>) => !!o.claim_url && /\bfree\b/i.test(o.title);

/**
 * @param defaultCurrency used when the email doesn't say (the user's home currency).
 * @param flightRefundRule the US DOT refund rule, for travel credits issued after a cancellation (US users).
 */
export interface EmailContext {
  /** When the email was sent (YYYY-MM-DD), for in-app deals; defaults to today. */
  sentOn?: string | null;
  /** Who sent it ("email.uber.com"): one store however its emails name it ("Uber", "Uber Eats"). */
  fromDomain?: string | null;
  /** The email's subject, to spot order updates that aren't purchases. */
  subject?: string | null;
}

const ORDER_UPDATE =
  /\b(shipped|has shipped|on (its|the) way|out for delivery|delivered|arriving|delivery (update|date|estimate)|(is |been )?delayed|on hold|payment (was )?(declined|failed)|problem with your (order|payment)|could not be processed|track your (order|package))\b/i;
const ORDER_CONFIRMED = /\b(receipt|order confirm|booking confirm|confirmation|thanks for your (order|purchase)|thank you for your (order|purchase))\b/i;

/**
 * Shipped, out for delivery, delivered, delivery date changed, order on hold, payment declined: news
 * about an order, not a purchase. Only the order confirmation or receipt is saved, so it's counted once.
 */
export function isOrderUpdate(subject: string | null | undefined): boolean {
  return !!subject && ORDER_UPDATE.test(subject) && !ORDER_CONFIRMED.test(subject);
}

export function toRows(p: ParsedEmail, today: string, defaultCurrency = 'USD', flightRefundRule: RefundRule | null = null, ctx: EmailContext = {}): Rows {
  const merchant = p.merchant;
  const store = storeOf(ctx.fromDomain ?? null, merchant);
  const sentOn = ctx.sentOn && ctx.sentOn <= today ? ctx.sentOn : today;
  const emailCurrency = p.receipt?.currency ?? defaultCurrency;
  const opportunities: OpportunityRow[] = [];
  const skipped = { expired: 0, noValue: 0, notMoney: 0 };
  let inApp = 0;

  for (const o of p.offers) {
    if (isTradeIn(o) || notAPerk(o)) {
      skipped.notMoney += 1;
      continue;
    }
    if (!isActionable(o)) {
      // "Buy 1, get 1 free at Shake Shack": real, but only in the app and only for a while.
      if (inAppDeal(o, merchant) && inApp < MAX_IN_APP) {
        // Shown for a week from when the email was sent: an old newsletter's deals are long gone.
        if (addDays(sentOn, IN_APP_DAYS) < today) skipped.expired += 1;
        else {
          inApp += 1;
          opportunities.push(inAppRow(o, merchant!, o.currency ?? emailCurrency, sentOn, p.interest ?? null, store));
        }
      } else skipped.noValue += 1;
      continue;
    }
    if (o.expires_on && o.expires_on < today) {
      skipped.expired += 1; // already expired when it arrived
      continue;
    }
    opportunities.push(offerRow(o, merchant, currencyIn(o) ?? o.currency ?? emailCurrency, flightRefundRule, p.interest ?? null, store));
  }

  let receipt: ReceiptRow | null = null;
  if (p.kind === 'card_alert' && p.receipt) {
    const r = p.receipt;
    // Declined and reversed charges aren't purchases; an alert without an amount can't be matched.
    if (r.alert_status !== 'declined' && r.alert_status !== 'reversed' && r.total !== null) {
      receipt = {
        kind: 'card_alert',
        pending: r.alert_status === 'pending',
        merchant: merchant ?? 'Unknown merchant',
        total: r.total,
        currency: r.currency ?? defaultCurrency,
        purchase_type: r.purchase_type,
        travel_date: r.travel_date,
        purchase_date: r.purchase_date ?? today,
        last_four: r.card_last_four,
        items: [],
        order_number: null,
        return_by: null,
        category: null,
      };
    }
  } else if (p.kind === 'receipt' && p.receipt && !isOrderUpdate(ctx.subject)) {
    const r = p.receipt;
    const returnBy = r.return_by ?? (r.purchase_date && r.return_window_days ? addDays(r.purchase_date, r.return_window_days) : null);
    receipt = {
      kind: 'receipt',
      pending: false,
      merchant: merchant ?? 'Unknown merchant',
      total: r.total,
      currency: r.currency ?? defaultCurrency,
      purchase_type: r.purchase_type,
      travel_date: r.travel_date,
      purchase_date: r.purchase_date,
      last_four: r.card_last_four,
      items: r.items,
      order_number: r.order_number,
      return_by: returnBy,
      category: null,
      discounts: r.discounts ?? [],
    };
    // Return windows aren't PerkScan's value (the store's own order page shows them): the receipt is kept for
    // card protections and price drops, but no reminder is created.
  }

  // The same offer can appear twice in one email.
  const seen = new Set<string>();
  return { receipt, opportunities: opportunities.filter((o) => !seen.has(o.dedupe_key) && seen.add(o.dedupe_key)), skipped };
}

/**
 * Why an email gave what it gave, in a few words, for "What PerkScan read". Null when it simply
 * found something new (the found offers say enough) or the email had nothing offer-like.
 */
export function readNote(r: { created: number; duplicates: number } & Rows['skipped']): string | null {
  const parts: string[] = [];
  if (r.duplicates) parts.push(r.duplicates === 1 && !r.created ? 'Already found in an earlier email' : `${r.duplicates} already found in earlier emails`);
  if (r.expired) parts.push(r.expired === 1 && !r.created && !r.duplicates ? 'Expired before it arrived' : `${r.expired} expired before it arrived`);
  if (r.notMoney) parts.push('A trade-in, prize draw or reward for doing something, not money you have');
  if (r.noValue) parts.push(r.noValue === 1 && !parts.length ? 'An offer with no code, amount or end date to act on' : `${r.noValue} with no code, amount or end date`);
  return parts.length ? parts.join(' · ') : null;
}
