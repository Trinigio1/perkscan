// Weekly "money at risk" notification and the monthly recap. Pure: notifications.ts
// schedules the digest; the recap screen shows the recap.

import type { LocalEvent } from './events';
import { isInAppDeal } from './inApp';
import { addToBag, formatBag, type MoneyBag } from './format';
import { isMissed, remainingValue } from './score';
import type { Opportunity, Recovered } from './types';

const DAY_MS = 86_400_000;
export const DIGEST_ID = 'digest-weekly';
const DIGEST_HOUR = 18;

/** The coming Sunday at 6pm local time (next week's if this one has passed). */
export function nextDigestDate(now: Date): Date {
  const d = new Date(now);
  d.setHours(DIGEST_HOUR, 0, 0, 0);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
  return d;
}

export interface Digest {
  id: string;
  fireAt: Date;
  title: string;
  body: string;
}

const recoveredMap = (recovered: Recovered[]) => {
  const m = new Map<string, number>();
  for (const r of recovered) if (r.opportunity_id) m.set(r.opportunity_id, (m.get(r.opportunity_id) ?? 0) + r.amount);
  return m;
};

/**
 * What's at risk in the 7 days after the digest fires, plus what's coming up near you that week.
 * Null when there's neither, so nobody gets an empty "nothing to do" nudge.
 */
export function planWeeklyDigest(
  opportunities: Opportunity[],
  recovered: Recovered[],
  now: Date,
  home: string,
  events: Pick<LocalEvent, 'title' | 'starts_on' | 'ends_on'>[] = [],
): Digest | null {
  const fireAt = nextDigestDate(now);
  const end = fireAt.getTime() + 7 * DAY_MS;
  const byOpp = recoveredMap(recovered);
  const items = opportunities
    .filter((o) => o.status === 'open' && o.type !== 'protection' && o.expires_at && !isInAppDeal(o))
    .filter((o) => {
      const t = new Date(o.expires_at!).getTime();
      return t > fireAt.getTime() && t <= end && (o.value_estimate === null || remainingValue(o, byOpp) > 0);
    })
    .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime());
  // Events that start, or end, in the digest's week.
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const [from, to] = [day(fireAt.getTime()), day(end)];
  const week = events.filter((e) => (e.starts_on > from && e.starts_on <= to) || (e.ends_on > from && e.ends_on <= to));
  const eventLine = week.length ? `Coming up: ${week.slice(0, 2).map((e) => e.title).join(', ')}${week.length > 2 ? ` and ${week.length - 2} more` : ''}.` : null;

  if (!items.length) {
    return eventLine ? { id: DIGEST_ID, fireAt, title: 'This week near you', body: eventLine } : null;
  }

  const bag: MoneyBag = {};
  for (const o of items) addToBag(bag, o.currency, remainingValue(o, byOpp));
  const money = Object.values(bag).some((v) => v > 0);
  const names = items.slice(0, 2).map((o) => o.title);
  const more = items.length - names.length;
  const yours = `${names.join(', ')}${more > 0 ? ` and ${more} more` : ''} — use ${items.length === 1 ? 'it' : 'them'} before ${items.length === 1 ? 'it expires' : 'they expire'}.`;
  return {
    id: DIGEST_ID,
    fireAt,
    title: money ? `${formatBag(bag, home)} at risk this week` : items.length === 1 ? '1 thing expires this week' : `${items.length} things expire this week`,
    body: eventLine ? `${yours} ${eventLine}` : yours,
  };
}

export interface Recap {
  /** First day of the month. */
  month: Date;
  recovered: MoneyBag;
  recoveredCount: number;
  missed: MoneyBag;
  missedCount: number;
  /** What you used this month, biggest first (title and amount). */
  used: { title: string; amount: number; currency: string }[];
  previousRecovered: MoneyBag;
}

const sameMonth = (iso: string, m: Date) => {
  const d = new Date(iso);
  return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
};

export function monthlyRecap(opportunities: Opportunity[], recovered: Recovered[], month: Date, now: Date): Recap {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const prev = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const byId = new Map(opportunities.map((o) => [o.id, o]));
  const byOpp = recoveredMap(recovered);

  const rec: MoneyBag = {};
  const prevRec: MoneyBag = {};
  const used: Recap['used'] = [];
  for (const r of recovered) {
    const currency = (r.opportunity_id && byId.get(r.opportunity_id)?.currency) || r.currency;
    if (sameMonth(r.recovered_at, start)) {
      addToBag(rec, currency, r.amount);
      used.push({ title: (r.opportunity_id && byId.get(r.opportunity_id)?.title) || 'Recovered', amount: r.amount, currency });
    } else if (sameMonth(r.recovered_at, prev)) addToBag(prevRec, currency, r.amount);
  }

  const missed: MoneyBag = {};
  let missedCount = 0;
  for (const o of opportunities) {
    if (!o.expires_at || isInAppDeal(o) || !sameMonth(o.expires_at, start) || !isMissed(o, now)) continue;
    const left = remainingValue(o, byOpp);
    if (left <= 0) continue;
    addToBag(missed, o.currency, left);
    missedCount += 1;
  }
  return {
    month: start,
    recovered: rec,
    recoveredCount: used.length,
    missed,
    missedCount,
    used: used.sort((a, b) => b.amount - a.amount),
    previousRecovered: prevRec,
  };
}

/** The share text: a total only — no stores, cards or offers. */
export function shareText(found: string): string {
  return `I found ${found} I was leaving on the table with PerkScan.`;
}
