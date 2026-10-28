import { sameMerchant } from '../merchant.ts';

// "Did you use it?" answered by your own receipts. When a receipt shows a code, gift card or credit
// that PerkScan found for you being applied, that item is used: PerkScan marks it and adds what it saved
// to Used. When a receipt only shows a discount that might be one of your offers, it asks instead.
// Pure: the pipeline loads the open items and writes the result.

export interface ReceiptDiscount {
  description: string;
  code: string | null;
  amount: number | null;
}

export interface UsageReceipt {
  merchant: string;
  /** YYYY-MM-DD */
  purchase_date: string | null;
  currency: string;
  discounts: ReceiptDiscount[];
}

export interface OpenItem {
  id: string;
  type: string;
  title: string;
  merchant: string | null;
  code: string | null;
  value_estimate: number | null;
  currency: string;
  expires_at: string | null;
  /** When the offer was first seen (its email's date): a receipt from before can't have used it. */
  seen_on: string;
  /** The user said "No, I didn't use it" to a guess: don't ask about it again for receipts before this. */
  used_guess_declined_at: string | null;
}

export interface UsageMatch {
  id: string;
  /** What it saved: the amount on the receipt, else the item's own value. */
  amount: number | null;
  /** 'used': the receipt shows it (the same code, or this store's credit). 'ask': a discount that might be it. */
  how: 'used' | 'ask';
  /** The receipt line it matched, for "Spotted on your receipt: Promo EATS25". */
  line: string;
}

const codeKey = (c: string | null | undefined) => (c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const day = (iso: string) => iso.slice(0, 10);

/** Gift cards, store credit and rewards paid with ("Kohl's Cash", "Gift card", "Reward applied"). */
const CREDIT_LINE = /gift ?card|store credit|\bcredit\b|reward|\bcash\b|voucher|certificate|balance|bucks/i;
/** Savings that come from a membership or the store's own pricing, never one of your offers. */
const NOT_YOURS = /\b(uber one|dashpass|prime|member(ship)?|subscription|delivery fee|service fee|sale|price drop|savings? on items|loyalty price|club price)\b/i;
const CREDIT_TYPES = new Set(['gift_card', 'store_credit', 'travel_credit', 'certificate']);

const close = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) <= Math.max(0.01, b * 0.02);

/**
 * Which of your open items this receipt used. At most one item per receipt line, and each item once.
 *  - The same code as one of your offers, at that store (or a long, specific code anywhere): used.
 *  - A gift card, credit or reward line at a store where you have exactly one such credit: used when
 *    the amount matches, else asked.
 *  - Any other discount at a store where you have exactly one open offer: asked, never assumed.
 * Only offers seen before the purchase and not expired by then count.
 */
export function usageFrom(receipt: UsageReceipt, items: OpenItem[]): UsageMatch[] {
  if (!receipt.discounts.length || !receipt.purchase_date) return [];
  const bought = receipt.purchase_date;
  const live = items.filter((o) => day(o.seen_on) <= bought && (!o.expires_at || day(o.expires_at) >= bought));
  const atStore = live.filter((o) => !!o.merchant && sameMerchant(o.merchant, receipt.merchant));
  const taken = new Set<string>();
  const out: UsageMatch[] = [];
  const add = (o: OpenItem, d: ReceiptDiscount, how: UsageMatch['how']) => {
    taken.add(o.id);
    out.push({ id: o.id, amount: d.amount ?? o.value_estimate, how, line: d.description });
  };

  for (const d of receipt.discounts) {
    // 1. The same code.
    const k = codeKey(d.code);
    if (k.length >= 4) {
      const hit = live.find((o) => !taken.has(o.id) && codeKey(o.code) === k && (atStore.includes(o) || k.length >= 8));
      if (hit) {
        add(hit, d, 'used');
        continue;
      }
    }
    if (d.code || NOT_YOURS.test(d.description)) continue;

    // 2. A gift card, credit or reward paid with at this store.
    if (CREDIT_LINE.test(d.description)) {
      const credits = atStore.filter((o) => !taken.has(o.id) && CREDIT_TYPES.has(o.type) && o.currency === receipt.currency);
      if (credits.length === 1) {
        add(credits[0]!, d, close(d.amount, credits[0]!.value_estimate) ? 'used' : 'ask');
        continue;
      }
    }

    // 3. Another discount: maybe one of your offers here. Only asked, and only when there's one candidate
    // the user hasn't already said no to for a later receipt.
    const offers = atStore.filter(
      (o) => !taken.has(o.id) && o.type === 'promo' && (!o.used_guess_declined_at || day(o.used_guess_declined_at) < bought),
    );
    if (offers.length === 1 && d.amount !== null) add(offers[0]!, d, 'ask');
  }
  return out;
}
