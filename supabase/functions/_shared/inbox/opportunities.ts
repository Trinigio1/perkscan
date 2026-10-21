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
}

export interface OpportunityRow {
  type: 'promo' | 'gift_card' | 'store_credit' | 'points' | 'free_trial' | 'settlement' | 'return_window';
  title: string;
  description: string | null;
  merchant: string | null;
  code: string | null;
  value_estimate: number | null;
  currency: string;
  expires_at: string | null;
  dedupe_key: string;
  action_steps: { step: string; url?: string }[];
}

export interface Rows {
  receipt: ReceiptRow | null;
  opportunities: OpportunityRow[];
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

const PREFIX: Record<string, string> = { USD: 'US$', TTD: 'TT$', CAD: 'CA$', JMD: 'J$', BBD: 'Bds$', EUR: '€', GBP: '£' };
/** "US$25" / "TT$19.99" / "25 XYZ". */
export function fmtMoney(n: number, currency: string): string {
  const num = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const p = PREFIX[currency];
  return p ? `${p}${num}` : `${num} ${currency}`;
}

function offerRow(o: Offer, merchant: string | null, currency: string): OpportunityRow {
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
    case 'settlement':
      type = 'settlement';
      steps.push({ step: 'Check eligibility and file on the official settlement site. PerkScan never files on your behalf.' });
      if (o.claim_url) steps.push({ step: 'Official claim site', url: o.claim_url });
      break;
  }
  if (o.expires_on) steps.push({ step: `Expires ${o.expires_on}.` });

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
    dedupe_key: `${type}:${slug(merchant)}:${slug(o.code ?? o.title)}:${o.expires_on ?? ''}`,
    action_steps: steps,
  };
}

/** Offers with no value, code, points or deadline are marketing noise. */
function isActionable(o: Offer): boolean {
  return o.amount !== null || o.percent_off !== null || o.code !== null || o.points !== null || o.expires_on !== null;
}

/**
 * @param defaultCurrency used when the email doesn't say (the user's home currency).
 */
export function toRows(p: ParsedEmail, today: string, defaultCurrency = 'USD'): Rows {
  const merchant = p.merchant;
  const emailCurrency = p.receipt?.currency ?? defaultCurrency;
  const opportunities: OpportunityRow[] = [];

  for (const o of p.offers) {
    if (!isActionable(o)) continue;
    if (o.expires_on && o.expires_on < today) continue; // already expired when it arrived
    opportunities.push(offerRow(o, merchant, o.currency ?? emailCurrency));
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
  } else if (p.kind === 'receipt' && p.receipt) {
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
    };
    if (returnBy && returnBy >= today) {
      opportunities.push({
        type: 'return_window',
        title: `Return window: ${merchant ?? 'recent order'}`,
        description: r.total !== null ? `Order total ${fmtMoney(r.total, r.currency ?? defaultCurrency)}` : null,
        merchant,
        code: null,
        value_estimate: null, // a return is a choice, not money owed
        currency: r.currency ?? defaultCurrency,
        expires_at: endOfDay(returnBy),
        dedupe_key: `return_window:${slug(merchant)}:${slug(r.order_number ?? r.purchase_date ?? String(r.total))}`,
        action_steps: [
          { step: 'Not happy with it? Start a return from your order page or the store.' },
          { step: `Last day to return: ${returnBy}.` },
        ],
      });
    }
  }

  // The same offer can appear twice in one email.
  const seen = new Set<string>();
  return { receipt, opportunities: opportunities.filter((o) => !seen.has(o.dedupe_key) && seen.add(o.dedupe_key)) };
}
