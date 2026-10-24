import { confidenceOf, type BenefitStatusOf } from './confidence';
import { KIND_LABELS, kindOf, viewOf, type MoneyKind, type SetupStep } from './money';
import type { Opportunity } from './types';

// What a new user sees first: the one next thing to do, how many perks still need checking,
// and what PerkScan found in their email. Pure, so every rule is tested.

/** The first setup step still to do, or null once everything is set up. */
export const nextStep = (steps: SetupStep[]): SetupStep | null => steps.find((s) => !s.done) ?? null;

/** Open items whose amount or terms aren't confirmed yet (shown as "Check"), protections aside. */
export function toCheckCount(opportunities: Opportunity[], now: Date, statusOf?: BenefitStatusOf): number {
  return opportunities.filter((o) => o.type !== 'protection' && viewOf(o, now) === 'open' && confidenceOf(o, statusOf) === 'check').length;
}

export interface FoundSummary {
  total: number;
  /** "3 codes", "1 gift card" … biggest first. */
  parts: { kind: MoneyKind; count: number; label: string }[];
}

const SINGULAR: Partial<Record<MoneyKind, string>> = {
  credits: 'card credit', codes: 'code', gift_cards: 'gift card', refunds: 'refund', returns: 'return window', protections: 'protection',
};

/** Everything PerkScan read out of the user's email and texts, by kind. */
export function foundSummary(opportunities: Opportunity[]): FoundSummary {
  const counts = new Map<MoneyKind, number>();
  for (const o of opportunities) {
    if (!o.source_message_id) continue;
    const k = kindOf(o);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => {
      const one = SINGULAR[kind];
      const label = one ? `${count} ${count === 1 ? one : `${one}s`}` : `${count} ${KIND_LABELS[kind].toLowerCase()}`;
      return { kind, count, label };
    });
  return { total: parts.reduce((s, p) => s + p.count, 0), parts };
}
