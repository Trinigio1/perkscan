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

/**
 * Plans "expiring soon" reminders for open card credits that still have value
 * (or whose value is unverified). Fires at 10:00 local time N days before expiry.
 */
export function planCreditReminders(opportunities: Opportunity[], recovered: Recovered[], now: Date): PlannedReminder[] {
  const recoveredByOpp = new Map<string, number>();
  for (const r of recovered) if (r.opportunity_id) recoveredByOpp.set(r.opportunity_id, (recoveredByOpp.get(r.opportunity_id) ?? 0) + r.amount);

  const out: PlannedReminder[] = [];
  for (const opp of opportunities) {
    if (opp.type !== 'card_credit' || opp.status !== 'open' || !opp.expires_at) continue;
    const remaining = remainingValue(opp, recoveredByOpp);
    if (opp.value_estimate !== null && remaining <= 0) continue;

    const expires = new Date(opp.expires_at);
    for (const days of REMINDER_DAYS_BEFORE) {
      const fireAt = new Date(expires.getTime() - days * DAY_MS);
      fireAt.setHours(REMINDER_HOUR, 0, 0, 0);
      if (fireAt.getTime() <= now.getTime() || fireAt.getTime() >= expires.getTime()) continue;
      const amount = opp.value_estimate === null ? 'Your' : `${formatMoney(remaining)} of your`;
      out.push({
        id: `credit-${opp.id}-${days}d`,
        opportunityId: opp.id,
        fireAt,
        title: days <= 2 ? `${opp.title} resets in ${days} days` : `${opp.title} resets in a week`,
        body: `${amount} ${opp.title} expires soon. Use it or lose it.`,
      });
    }
  }
  out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return out.slice(0, MAX_REMINDERS);
}
