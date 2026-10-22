import { remainingValue } from './score';
import type { Opportunity, Recovered } from './types';
import { formatMoney } from './format';

const DAY_MS = 24 * 60 * 60 * 1000;
/** iOS keeps at most 64 scheduled local notifications per app; leave headroom. */
export const MAX_REMINDERS = 50;
export const REMINDER_DAYS_BEFORE = [7, 2] as const;
const REMINDER_HOUR = 10;

export interface PlannedReminder {
  /** Stable id so rescheduling replaces rather than duplicates. */
  id: string;
  opportunityId: string;
  fireAt: Date;
  title: string;
  body: string;
}

const NOUN: Record<string, string> = {
  promo: 'code',
  gift_card: 'gift card',
  store_credit: 'store credit',
  points: 'points',
  free_trial: 'free trial',
  return_window: 'return window',
  settlement: 'settlement claim',
  refund: 'refund request',
  benefit: 'benefit',
  price_drop: 'price-drop window',
  protection: 'warranty or protection',
};

/**
 * Plans "expiring soon" reminders for open opportunities: card credits that still
 * have value (or an unverified amount), and offers from email with a deadline.
 * Fires at 10:00 local time N days before expiry.
 */
export function planCreditReminders(opportunities: Opportunity[], recovered: Recovered[], now: Date): PlannedReminder[] {
  const recoveredByOpp = new Map<string, number>();
  for (const r of recovered) if (r.opportunity_id) recoveredByOpp.set(r.opportunity_id, (recoveredByOpp.get(r.opportunity_id) ?? 0) + r.amount);

  const out: PlannedReminder[] = [];
  for (const opp of opportunities) {
    if (opp.status !== 'open' || !opp.expires_at) continue;
    const remaining = remainingValue(opp, recoveredByOpp);
    if (opp.value_estimate !== null && remaining <= 0) continue;

    const expires = new Date(opp.expires_at);
    for (const days of REMINDER_DAYS_BEFORE) {
      const fireAt = new Date(expires.getTime() - days * DAY_MS);
      fireAt.setHours(REMINDER_HOUR, 0, 0, 0);
      if (fireAt.getTime() <= now.getTime() || fireAt.getTime() >= expires.getTime()) continue;
      const when = days <= 2 ? `in ${days} days` : 'in a week';
      if (opp.type === 'card_credit') {
        const amount = opp.value_estimate === null ? 'Your' : `${formatMoney(remaining, { currency: opp.currency })} of your`;
        out.push({
          id: `remind-${opp.id}-${days}d`,
          opportunityId: opp.id,
          fireAt,
          title: `${opp.title} resets ${when}`,
          body: `${amount} ${opp.title} expires soon. Use it or lose it.`,
        });
      } else {
        const who = opp.merchant ? `${opp.merchant} ` : '';
        const noun = NOUN[opp.type] ?? 'offer';
        out.push({
          id: `remind-${opp.id}-${days}d`,
          opportunityId: opp.id,
          fireAt,
          title: opp.type === 'free_trial' ? `${who}trial ends ${when}` : `Your ${who}${noun} expires ${when}`,
          body: opp.type === 'free_trial' ? 'Cancel before then if you don’t want to be charged.' : opp.title,
        });
      }
    }
  }
  out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return out.slice(0, MAX_REMINDERS);
}
