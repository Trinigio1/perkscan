import { formatMoney } from './format';
import type { Opportunity, Receipt } from './types';

// Claiming made easy: PerkScan writes the request, the user sends it. Only facts PerkScan read
// from the receipt or offer go in; anything it doesn't know is left as a [bracketed] gap for the
// user to fill — never guessed. Pure, so every rule is tested.

export type ClaimKind = 'price_adjustment' | 'refund' | 'duplicate_charge' | 'return' | 'settlement' | 'card_claim';

export interface ClaimFact {
  label: string;
  value: string;
}

export interface ClaimHelp {
  kind: ClaimKind;
  /** "Ask Target for the difference" */
  heading: string;
  /** Who it goes to, in plain words. */
  to: string;
  /** A ready-to-send message, or null when the claim is a form to fill in instead. */
  message: { subject: string; body: string } | null;
  /** Bracketed gaps the user must fill before sending. */
  gaps: string[];
  /** Details to copy into a form. */
  facts: ClaimFact[];
  /** Official page to file on, when PerkScan has one. */
  url: string | null;
}

export interface ClaimContext {
  opp: Pick<Opportunity, 'type' | 'title' | 'merchant' | 'value_estimate' | 'currency' | 'dedupe_key' | 'action_steps' | 'code'>;
  receipt?: Pick<Receipt, 'merchant' | 'total' | 'currency' | 'purchase_date' | 'last_four' | 'order_number'> | null;
  /** The user's name for the sign-off, if known. */
  name?: string | null;
}

const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "[order number]" when unknown, so the gap is obvious and never guessed. */
function fill(value: string | null | undefined, gap: string, gaps: string[]): string {
  if (value && value.trim()) return value.trim();
  if (!gaps.includes(gap)) gaps.push(gap);
  return gap;
}

/** All the bracketed gaps in a text, in order. */
export const gapsIn = (text: string) => [...new Set(text.match(/\[[^\]]+\]/g) ?? [])];

/** A mailto: link with the message filled in; the user picks who it goes to and presses send. */
export function mailtoLink(m: { subject: string; body: string }): string {
  return `mailto:?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
}

export function claimHelp(ctx: ClaimContext): ClaimHelp | null {
  const { opp, receipt } = ctx;
  const gaps: string[] = [];
  const store = opp.merchant || receipt?.merchant || null;
  const cur = receipt?.currency ?? opp.currency;
  const money = (n: number) => formatMoney(n, { currency: cur, home: cur });
  const storeName = fill(store, '[store]', gaps);
  const order = receipt?.order_number?.trim() || null;
  const date = receipt?.purchase_date ? longDate(receipt.purchase_date) : null;
  const total = receipt?.total != null ? money(receipt.total) : null;
  const amount = opp.value_estimate != null ? money(opp.value_estimate) : null;
  const url = opp.action_steps.find((s) => s.url)?.url ?? null;
  const signOff = `Thank you,\n${fill(ctx.name, '[your name]', gaps)}`;
  const orderLine = order ? `order #${order}` : `my order ${fill(null, '[order number]', gaps)}`;
  const facts: ClaimFact[] = [
    store ? { label: 'Store', value: store } : null,
    date ? { label: 'Purchase date', value: date } : null,
    total ? { label: 'Amount paid', value: total } : null,
    order ? { label: 'Order number', value: order } : null,
    receipt?.last_four ? { label: 'Card', value: `ending ${receipt.last_four}` } : null,
  ].filter((f): f is ClaimFact => !!f);

  const done = (h: Omit<ClaimHelp, 'gaps' | 'facts'> & { facts?: ClaimFact[] }): ClaimHelp => ({
    facts,
    ...h,
    gaps: h.message ? gapsIn(`${h.message.subject}\n${h.message.body}`) : [],
  });

  switch (opp.type) {
    case 'price_drop': {
      const body = [
        `Hello ${storeName},`,
        '',
        `I bought ${orderLine}${date ? ` on ${date}` : ''}${total ? ` for ${total}` : ''}. The price has since dropped to [today's price].`,
        '',
        `Under your price adjustment policy, I'd like a refund of the difference to my original payment method.`,
        '',
        signOff,
      ].join('\n');
      return done({ kind: 'price_adjustment', heading: `Ask ${store ?? 'the store'} for the difference`, to: `${store ?? 'The store'}'s customer service`, message: { subject: `Price adjustment request${order ? ` — order #${order}` : ''}`, body }, url });
    }

    case 'refund': {
      if (opp.dedupe_key?.startsWith('double_charge:')) {
        const card = receipt?.last_four ? `my card ending ${receipt.last_four}` : `my card ending ${fill(null, '[last 4 digits]', gaps)}`;
        const body = [
          'Hello,',
          '',
          `I was charged ${total ?? amount ?? fill(null, '[amount]', gaps)} twice by ${storeName}${date ? ` on ${date}` : ''} on ${card}. I only made one purchase.`,
          '',
          'Please reverse the duplicate charge.',
          '',
          signOff,
        ].join('\n');
        return done({ kind: 'duplicate_charge', heading: 'Ask your bank to reverse the duplicate', to: 'Your card issuer (the number on the back of your card, or its app)', message: { subject: 'Duplicate charge to reverse', body }, url: null });
      }
      const body = [
        `Hello ${storeName},`,
        '',
        `I'm writing about ${orderLine}${date ? ` from ${date}` : ''}: ${opp.title}.`,
        '',
        `Please refund ${amount ?? fill(null, '[amount]', gaps)} to my original payment method.`,
        '',
        signOff,
      ].join('\n');
      return done({ kind: 'refund', heading: `Ask ${store ?? 'them'} for your refund`, to: `${store ?? 'The company'}'s customer service`, message: { subject: `Refund request${order ? ` — order #${order}` : ''}`, body }, url });
    }

    case 'return_window': {
      const body = [
        `Hello ${storeName},`,
        '',
        `I'd like to return ${fill(null, '[item]', gaps)} from ${orderLine}${date ? `, placed on ${date}` : ''}. Please send me return instructions.`,
        '',
        signOff,
      ].join('\n');
      return done({ kind: 'return', heading: 'Start a return', to: `${store ?? 'The store'}'s customer service`, message: { subject: `Return request${order ? ` — order #${order}` : ''}`, body }, url });
    }

    case 'settlement':
      // Settlement claims are forms on the official site: hand over the details to copy.
      return done({ kind: 'settlement', heading: 'File your claim', to: 'The official settlement site', message: null, url });

    case 'protection':
      return done({ kind: 'card_claim', heading: 'Details for your claim', to: 'Your card’s benefits administrator', message: null, url });

    default:
      return null;
  }
}

/** Open items whose claim was started and are due a "Did it arrive?" check, oldest first. */
export function claimsToCheck<T extends Pick<Opportunity, 'status' | 'claim_started_at' | 'claim_check_after'>>(opportunities: T[], now: Date): T[] {
  return opportunities
    .filter((o) => o.status === 'open' && !!o.claim_started_at && !!o.claim_check_after && new Date(o.claim_check_after) <= now)
    .sort((a, b) => a.claim_check_after!.localeCompare(b.claim_check_after!));
}
