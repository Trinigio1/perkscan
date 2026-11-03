import { confidenceOf, type BenefitStatusOf } from './confidence';
import { addToBag, type MoneyBag } from './format';
import { KIND_LABELS, kindOf, type MoneyKind } from './money';
import type { Opportunity, Recovered, Saving } from './types';

// Proof, month by month: what PerkScan put in front of you, what you used, and how much of that you
// didn't know about before PerkScan (your own answer: nothing is assumed). Pure, so it's tested.

/** The paid plan, for "your plan paid for itself". */
export const PLAN = { name: 'PerkScan Plus', monthly: 9.99, currency: 'USD' } as const;

export interface SourceTotal {
  kind: MoneyKind;
  label: string;
  total: MoneyBag;
  count: number;
}

export interface MonthValue {
  /** Money that became usable this month: credits that reset, refunds and price drops owed, offers with an amount. Never guesses. */
  newValue: MoneyBag;
  newCount: number;
  newBySource: SourceTotal[];
  /** What you used (marked, or seen on a receipt). */
  used: MoneyBag;
  usedCount: number;
  /** Used, and you said PerkScan found it. */
  found: MoneyBag;
  foundCount: number;
  /** Used, and you said you already knew. */
  knew: MoneyBag;
  knewCount: number;
  /** Used, not answered yet. */
  unanswered: number;
  /** Money you kept by acting on a money move this month (confirmed by you); part of found. */
  saved: MoneyBag;
  savedCount: number;
  /** What PerkScan found ÷ the plan's monthly price (its currency only), or null when nothing was found. */
  paidFor: number | null;
}

const within = (iso: string | null | undefined, from: Date, to: Date) => {
  if (!iso) return false;
  const t = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime();
  return t >= from.getTime() && t < to.getTime();
};

/** When an item became usable: a credit when its period starts, anything else when PerkScan found it. */
export const becameUsable = (o: Pick<Opportunity, 'type' | 'period_start' | 'created_at'>) => (o.type === 'card_credit' && o.period_start ? o.period_start : o.created_at ?? null);

/** Whether a confirmed saving counts in a month: one-offs once, monthly ones every month they run, yearly ones in their month. */
export function savingInMonth(s: Pick<Saving, 'per' | 'started_on' | 'ended_on'>, from: Date, to: Date): boolean {
  const start = new Date(`${s.started_on.slice(0, 10)}T12:00:00`);
  const end = s.ended_on ? new Date(`${s.ended_on.slice(0, 10)}T12:00:00`) : null;
  if (s.per === 'once') return start >= from && start < to;
  if (start >= to || (end && end < from)) return false;
  return s.per === 'month' || start.getMonth() === from.getMonth();
}

export function monthValue(opportunities: Opportunity[], recovered: Recovered[], from: Date, to: Date, statusOf?: BenefitStatusOf, savings: Saving[] = []): MonthValue {
  const out: MonthValue = { newValue: {}, newCount: 0, newBySource: [], used: {}, usedCount: 0, found: {}, foundCount: 0, knew: {}, knewCount: 0, unanswered: 0, saved: {}, savedCount: 0, paidFor: null };
  const sources = new Map<MoneyKind, SourceTotal>();
  for (const o of opportunities) {
    if (!(o.value_estimate && o.value_estimate > 0) || o.status === 'dismissed') continue;
    if (!within(becameUsable(o), from, to) || confidenceOf(o, statusOf) === 'check') continue;
    addToBag(out.newValue, o.currency, o.value_estimate);
    out.newCount += 1;
    const kind = kindOf(o);
    const line = sources.get(kind) ?? { kind, label: KIND_LABELS[kind], total: {}, count: 0 };
    addToBag(line.total, o.currency, o.value_estimate);
    line.count += 1;
    sources.set(kind, line);
  }
  const size = (l: SourceTotal) => Math.max(0, ...Object.values(l.total));
  out.newBySource = [...sources.values()].sort((a, b) => size(b) - size(a));

  for (const r of recovered) {
    if (!(r.amount > 0) || !within(r.recovered_at, from, to)) continue;
    addToBag(out.used, r.currency, r.amount);
    out.usedCount += 1;
    if (r.knew_before === false) {
      addToBag(out.found, r.currency, r.amount);
      out.foundCount += 1;
    } else if (r.knew_before === true) {
      addToBag(out.knew, r.currency, r.amount);
      out.knewCount += 1;
    } else if (r.knew_before === null) {
      out.unanswered += 1;
    }
  }
  // Money moves you acted on: PerkScan pointed them out, so they're found, and kept money counts as used.
  for (const sv of savings) {
    if (!(sv.amount > 0) || !savingInMonth(sv, from, to)) continue;
    addToBag(out.saved, sv.currency, sv.amount);
    addToBag(out.found, sv.currency, sv.amount);
    addToBag(out.used, sv.currency, sv.amount);
    out.savedCount += 1;
  }
  const foundInPlan = out.found[PLAN.currency] ?? 0;
  out.paidFor = foundInPlan > 0 ? Math.round((foundInPlan / PLAN.monthly) * 10) / 10 : null;
  return out;
}

export interface KnewQuestion {
  recovered: Recovered;
  opp: Opportunity | null;
}

/**
 * Recent money you got back that you haven't said whether you knew about, newest first. Only where the
 * question is supported (an older database has no answer column: nothing is asked).
 */
export function knewQuestions(recovered: Recovered[], opportunities: Opportunity[], now: Date, days = 45): KnewQuestion[] {
  const since = now.getTime() - days * 86_400_000;
  const byId = new Map(opportunities.map((o) => [o.id, o]));
  return recovered
    .filter((r) => r.knew_before === null && r.amount > 0 && new Date(r.recovered_at).getTime() >= since)
    .sort((a, b) => b.recovered_at.localeCompare(a.recovered_at))
    .map((r) => ({ recovered: r, opp: r.opportunity_id ? (byId.get(r.opportunity_id) ?? null) : null }));
}
