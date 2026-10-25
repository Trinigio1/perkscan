import type { Opportunity, Receipt } from './types';

// "Why you have this": every item says where PerkScan got it, so nothing feels random.
// Only facts PerkScan holds: the card you added, the email or text it was read from, the purchase
// it was matched to. Pure, so every rule is tested.

export interface Why {
  /** Fits on a row: "From your email", "Amex Gold ·· 4242". */
  short: string;
  /** For the item's own screen: "Found in an email from target.com." */
  long: string;
}

export interface WhyContext {
  /** "Amex Gold ·· 4242" for one of the user's cards, or '' if unknown. */
  cardLabel: (userCardId: string | null) => string;
  receiptById: (id: string) => Pick<Receipt, 'merchant' | 'purchase_date'> | undefined;
}

const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

type Item = Opportunity & { sender_domain?: string | null; message_source?: 'email' | 'sms' | 'share' | null };

export function whyYouHaveThis(o: Item, ctx: WhyContext): Why | null {
  const key = o.dedupe_key ?? '';
  const card = ctx.cardLabel(o.user_card_id);

  if (key.startsWith('manual:')) return { short: 'You added this', long: 'You added this yourself.' };
  if (key.startsWith('deal:')) {
    const store = o.merchant ?? 'a store you use';
    return { short: `Saved from ${store}’s offers`, long: `You saved this from ${store}’s own promotions page.` };
  }
  if (o.type === 'card_credit' && card) return { short: card, long: `Because you have ${card}. It comes with the card.` };

  // Matched to a purchase: protections, price adjustments, settlements, double charges.
  const receipt = o.source_receipt_id ? ctx.receiptById(o.source_receipt_id) : undefined;
  if (receipt) {
    const when = receipt.purchase_date ? ` on ${shortDate(receipt.purchase_date)}` : '';
    const paid = card ? ` with ${card}` : '';
    if (key.startsWith('settlement:')) {
      return { short: `Your ${receipt.merchant} purchase`, long: `Because you bought from ${receipt.merchant}${when}, within this settlement’s purchase dates.` };
    }
    return { short: `Your ${receipt.merchant} purchase`, long: `Because you bought from ${receipt.merchant}${when}${paid}.` };
  }

  if (o.source_message_id) {
    if (o.message_source === 'sms') return { short: 'From a text', long: 'Found in a text message you sent PerkScan.' };
    if (o.message_source === 'share') return { short: 'From something you shared', long: 'Found in something you shared with PerkScan.' };
    const from = o.sender_domain ? ` from ${o.sender_domain}` : '';
    return { short: 'From your email', long: `Found in an email${from}.` };
  }
  if (card) return { short: card, long: `Because you have ${card}.` };
  return null;
}
