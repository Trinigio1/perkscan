import { remainingValue } from './score';
import { isInAppDeal } from './inApp';
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
  // Card credits from one card that end the same day are one reminder, not one each.
  const credits = new Map<string, { fireAt: Date; when: string; items: { opp: Opportunity; remaining: number }[] }>();
  for (const opp of opportunities) {
    if (opp.status !== 'open' || !opp.expires_at || isInAppDeal(opp)) continue;
    const remaining = remainingValue(opp, recoveredByOpp);
    if (opp.value_estimate !== null && remaining <= 0) continue;

    const expires = new Date(opp.expires_at);
    for (const days of REMINDER_DAYS_BEFORE) {
      const fireAt = new Date(expires.getTime() - days * DAY_MS);
      fireAt.setHours(REMINDER_HOUR, 0, 0, 0);
      if (fireAt.getTime() <= now.getTime() || fireAt.getTime() >= expires.getTime()) continue;
      const when = days <= 2 ? `in ${days} days` : 'in a week';
      if (opp.type === 'card_credit') {
        const key = `${opp.user_card_id ?? opp.id}|${fireAt.getTime()}`;
        const group = credits.get(key) ?? { fireAt, when, items: [] };
        group.items.push({ opp, remaining });
        credits.set(key, group);
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
  for (const { fireAt, when, items } of credits.values()) {
    const days = when === 'in a week' ? 7 : 2;
    const first = items[0]!.opp;
    if (items.length === 1) {
      const amount = first.value_estimate === null ? 'Your' : `${formatMoney(items[0]!.remaining, { currency: first.currency })} of your`;
      out.push({
        id: `remind-${first.id}-${days}d`,
        opportunityId: first.id,
        fireAt,
        title: `${first.title} resets ${when}`,
        body: `${amount} ${first.title} expires soon. Use it or lose it.`,
      });
      continue;
    }
    // "$27 in card credits resets in 2 days: Uber Cash $10 · Dining credit $10 · Dunkin' credit $7".
    const known = items.filter((x) => x.opp.value_estimate !== null);
    const sameCur = known.length === items.length && known.every((x) => x.opp.currency === first.currency);
    const total = known.reduce((n, x) => n + x.remaining, 0);
    out.push({
      id: `remind-${first.user_card_id ?? first.id}-${fireAt.toISOString().slice(0, 10)}-${days}d`,
      opportunityId: first.id,
      fireAt,
      title: sameCur ? `${formatMoney(total, { currency: first.currency })} in card credits resets ${when}` : `${items.length} card credits reset ${when}`,
      body: `${items
        .slice(0, 3)
        .map((x) => (x.opp.value_estimate === null ? x.opp.title : `${x.opp.title} ${formatMoney(x.remaining, { currency: x.opp.currency })}`))
        .join(' · ')}${items.length > 3 ? ` and ${items.length - 3} more` : ''}. Use them or lose them.`,
    });
  }
  // "Did it arrive?" a few days after the user asked for a refund or filed a claim.
  for (const opp of opportunities) {
    if (opp.status !== 'open' || !opp.claim_started_at || !opp.claim_check_after) continue;
    const fireAt = new Date(opp.claim_check_after);
    fireAt.setHours(REMINDER_HOUR, 0, 0, 0);
    if (fireAt.getTime() <= now.getTime()) continue;
    out.push({
      id: `remind-${opp.id}-arrived`,
      opportunityId: opp.id,
      fireAt,
      title: `Did your ${opp.merchant ? `${opp.merchant} ` : ''}${opp.type === 'settlement' ? 'settlement' : 'money'} arrive?`,
      body: `${opp.title}. Tap to tell PerkScan, so your total stays real.`,
    });
  }
  out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return out.slice(0, MAX_REMINDERS);
}
