import { confidenceOf, type BenefitStatusOf, type Confidence } from './confidence';
import type { Deal } from './deals';
import type { LocalEvent } from './events';
import { viewOf } from './money';
import type { Opportunity } from './types';

// "Act now": the few things most worth doing today, from everything PerkScan knows about.
// One scoring rule for every kind of item, so ordering is never hard-coded per screen:
//   how soon it's lost  +  how much it's worth  +  how easy it is  ×  how sure PerkScan is.
// Pure, so every rule is tested.

const DAY = 86_400_000;

/** How much effort claiming takes: one tap, sending a request, or filling a form. */
export type Effort = 'tap' | 'request' | 'form';

export interface PriorityInput {
  /** Cash value if known, in the item's own currency (never converted). */
  value: number | null;
  /** When it's lost: expires, resets or the deadline passes. */
  deadline: Date | null;
  confidence: Confidence;
  effort: Effort;
}

/** Points for urgency: under a day is the most, nothing for "no deadline". */
export function urgencyPoints(deadline: Date | null, now: Date): number {
  if (!deadline) return 0;
  const days = (deadline.getTime() - now.getTime()) / DAY;
  if (days <= 0) return 0; // already lost: belongs in Missed, not Act now
  if (days <= 1) return 40;
  if (days <= 3) return 32;
  if (days <= 7) return 24;
  if (days <= 14) return 14;
  if (days <= 30) return 6;
  return 0;
}

/** Points for value on a gentle curve ($10 ≈ 12, $100 ≈ 24, $1,000 = 30): amounts differ by currency. */
export function valuePoints(value: number | null): number {
  if (value === null || value <= 0) return 4; // something, but nothing PerkScan can count
  return Math.min(30, Math.log10(value + 1) * 12);
}

const EFFORT_POINTS: Record<Effort, number> = { tap: 6, request: 2, form: 0 };
const CONFIDENCE_WEIGHT: Record<Confidence, number> = { confirmed: 1, likely: 0.85, check: 0.5 };

export function priorityScore(x: PriorityInput, now: Date): number {
  const raw = urgencyPoints(x.deadline, now) + valuePoints(x.value) + EFFORT_POINTS[x.effort];
  return Math.round(raw * CONFIDENCE_WEIGHT[x.confidence] * 10) / 10;
}

/** Requests you send (refunds, price adjustments, returns) and forms (settlements) take more than a tap. */
export function effortOf(o: Pick<Opportunity, 'type'>): Effort {
  if (o.type === 'settlement' || o.type === 'protection') return 'form';
  if (o.type === 'refund' || o.type === 'price_drop' || o.type === 'return_window') return 'request';
  return 'tap';
}

export type ActItem =
  | { kind: 'item'; opp: Opportunity; score: number }
  | { kind: 'offer'; deal: Deal; why: string; score: number }
  | { kind: 'event'; event: LocalEvent; score: number };

export interface ActNowInput {
  opportunities: Opportunity[];
  recoveredByOpp: Map<string, number>;
  /** Offers at your stores (already filtered to stores you use). */
  offers: { deal: Deal; why: string }[];
  /** Events that apply to you (your cards, your state). */
  events: LocalEvent[];
  statusOf?: BenefitStatusOf;
}

// Only the urgent part of offers and events competes for Act now; the rest stays on their own screens.
const OFFER_DAYS = 7;
const EVENT_DAYS = 7;
// Optional spending (an offer, a sale) never outranks money that's already yours at the same urgency.
const OFFER_WEIGHT = 0.7;

/** The ranked "Act now" list: open items worth doing something about, then urgent offers and events. */
export function actNow(input: ActNowInput, now: Date, max = 5): ActItem[] {
  const out: ActItem[] = [];
  for (const o of input.opportunities) {
    if (viewOf(o, now) !== 'open') continue;
    // Protections only matter if something goes wrong; waiting claims get their own "Did it arrive?".
    if (o.type === 'protection' || o.claim_started_at) continue;
    const left = o.value_estimate === null ? null : Math.max(0, o.value_estimate - (input.recoveredByOpp.get(o.id) ?? 0));
    if (left === 0) continue; // used in full
    const deadline = o.expires_at ? new Date(o.expires_at) : null;
    // A return window is only worth a nudge as it closes.
    if (o.type === 'return_window' && (!deadline || deadline.getTime() - now.getTime() > 7 * DAY)) continue;
    const confidence = confidenceOf(o, input.statusOf);
    out.push({ kind: 'item', opp: o, score: priorityScore({ value: confidence === 'check' ? null : left, deadline, confidence, effort: effortOf(o) }, now) });
  }
  for (const { deal, why } of input.offers) {
    if (!deal.ends_on) continue;
    const deadline = new Date(`${deal.ends_on}T23:59:59Z`);
    if (deadline.getTime() - now.getTime() > OFFER_DAYS * DAY) continue;
    const score = priorityScore({ value: deal.amount, deadline, confidence: deal.confidence, effort: 'tap' }, now) * OFFER_WEIGHT;
    out.push({ kind: 'offer', deal, why, score: Math.round(score * 10) / 10 });
  }
  for (const e of input.events) {
    const starts = new Date(`${e.starts_on}T00:00:00Z`);
    const ends = new Date(`${e.ends_on}T23:59:59Z`);
    const live = starts.getTime() <= now.getTime();
    // Coming within a week, or happening now and ending within a week.
    if (!live && starts.getTime() - now.getTime() > EVENT_DAYS * DAY) continue;
    if (live && ends.getTime() - now.getTime() > EVENT_DAYS * DAY) continue;
    const score = priorityScore({ value: null, deadline: live ? ends : starts, confidence: e.status === 'confirmed' ? 'confirmed' : 'check', effort: 'tap' }, now) * OFFER_WEIGHT;
    out.push({ kind: 'event', event: e, score: Math.round(score * 10) / 10 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}
