import { matchStore, storeKey } from './deals';
import type { LocalEvent } from './events';
import { formatMoney, shortCardName } from './format';
import type { Program } from './programs';
import type { PlannedReminder } from './reminders';
import type { Card, CardBenefit, Opportunity } from './types';

// The right moment: a nudge on the day something becomes usable, not only before it runs out.
//   - card credits back on the day they reset ("Your Amex Gold credits are back")
//   - an event on its first day ("Today: Museums on Us"), for your bank's events and ones you asked about
//   - your birthday month, with the free birthday rewards at stores you use
// Only amounts the catalog has verified are named. Pure, so every rule is tested.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const REMINDER_HOUR = 10;
const EVENT_HOUR = 9;
const PERIOD_MONTHS: Partial<Record<CardBenefit['period'], number>> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

/** A moment notification: like an expiry reminder, but it opens a screen instead of one item. */
export type Moment = Omit<PlannedReminder, 'opportunityId'> & { opportunityId: string | null; route: string };

const at = (d: Date, hour: number) => {
  const t = new Date(d);
  t.setHours(hour, 0, 0, 0);
  return t;
};

/** The first day of the next calendar period after now ("2026-11-01" for a monthly credit in October). */
export function nextPeriodStart(period: CardBenefit['period'], now: Date): Date | null {
  const months = PERIOD_MONTHS[period];
  if (!months) return null;
  const next = Math.floor(now.getMonth() / months) * months + months;
  return new Date(now.getFullYear() + Math.floor(next / 12), next % 12, 1);
}

export interface MomentsInput {
  userCards: { id: string; card_id: string; last_four: string | null }[];
  cards: Pick<Card, 'id' | 'kind' | 'product_name' | 'currency'>[];
  benefits: Pick<CardBenefit, 'id' | 'card_id' | 'type' | 'name' | 'amount' | 'period' | 'period_anchor' | 'status' | 'currency'>[];
  /** Events near you that apply to you (relevantEvents). */
  events: Pick<LocalEvent, 'id' | 'title' | 'summary' | 'starts_on' | 'issuers'>[];
  opportunities: Pick<Opportunity, 'status' | 'title' | 'dedupe_key'>[];
  programs: Pick<Program, 'id' | 'name' | 'provider' | 'summary' | 'merchants' | 'status' | 'kind'>[];
  /** "I have it" / "Not for me" on programs. */
  feedback: Map<string, 'have' | 'dismissed'>;
  /** Stores you buy from (store keys). */
  shops: Set<string>;
  /** 1–12, if you told PerkScan. */
  birthMonth: number | null;
}

export function planMoments(d: MomentsInput, now: Date): Moment[] {
  const out: Moment[] = [];

  // 1. Credits back: one per card on the day its credits reset, naming each verified amount.
  for (const uc of d.userCards) {
    const card = d.cards.find((c) => c.id === uc.card_id);
    if (!card || card.kind === 'membership') continue;
    const byDay = new Map<number, { name: string; amount: number; currency: string }[]>();
    for (const b of d.benefits) {
      if (b.card_id !== card.id || b.type !== 'credit' || b.status !== 'active' || b.amount === null || b.period_anchor !== 'calendar') continue;
      const start = nextPeriodStart(b.period, now);
      if (!start) continue;
      const list = byDay.get(start.getTime()) ?? [];
      list.push({ name: b.name, amount: Number(b.amount), currency: b.currency ?? card.currency });
      byDay.set(start.getTime(), list);
    }
    const name = shortCardName(card.product_name);
    for (const [t, list] of byDay) {
      const fireAt = at(new Date(t), REMINDER_HOUR);
      if (fireAt.getTime() <= now.getTime()) continue;
      const sameCur = list.every((x) => x.currency === list[0]!.currency);
      const total = list.reduce((n, x) => n + x.amount, 0);
      out.push({
        id: `renew-${uc.id}-${fireAt.toISOString().slice(0, 10)}`,
        opportunityId: null,
        route: '/money',
        fireAt,
        title: sameCur && list.length > 1 ? `${formatMoney(total, { currency: list[0]!.currency })} in ${name} credits is back` : `Your ${name} credit is back`,
        body: `${list.map((x) => `${x.name} ${formatMoney(x.amount, { currency: x.currency })}`).join(' · ')}. New period, ready to use.`,
      });
    }
  }

  // 2. Events on their first day: your bank's (you hold its card) and ones you asked to be reminded of.
  const reminded = new Set(d.opportunities.filter((o) => o.status === 'open' && o.dedupe_key?.startsWith('manual:')).map((o) => o.title));
  for (const e of d.events) {
    if (!e.issuers.length && !reminded.has(e.title)) continue;
    const fireAt = at(new Date(`${e.starts_on}T12:00:00`), EVENT_HOUR);
    if (fireAt.getTime() <= now.getTime()) continue;
    out.push({ id: `event-${e.id}-${e.starts_on}`, opportunityId: null, route: '/coming-up', fireAt, title: `Today: ${e.title}`, body: e.summary });
  }

  // 3. Birthday month: free birthday rewards at stores you use, or programs you said you have.
  if (d.birthMonth && d.birthMonth >= 1 && d.birthMonth <= 12) {
    const year = now.getMonth() + 1 > d.birthMonth ? now.getFullYear() + 1 : now.getFullYear();
    const fireAt = at(new Date(year, d.birthMonth - 1, 1), REMINDER_HOUR);
    const stores = d.programs
      .filter((p) => p.status === 'active' && /birthday/i.test(p.summary) && d.feedback.get(p.id) !== 'dismissed')
      .filter((p) => d.feedback.get(p.id) === 'have' || (p.merchants.length > 0 && matchStore({ merchant: p.provider, merchant_keys: p.merchants.map(storeKey) }, d.shops)))
      .map((p) => p.provider);
    if (stores.length && fireAt.getTime() > now.getTime()) {
      const names = [...new Set(stores)];
      out.push({
        id: `birthday-${year}`,
        opportunityId: null,
        route: '/deals',
        fireAt,
        title: 'It’s your birthday month',
        body: `Free birthday rewards at ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}. Most need you to be a member first.`,
      });
    }
  }
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
