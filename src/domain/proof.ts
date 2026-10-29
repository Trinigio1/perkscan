import { addToBag, formatBag, type MoneyBag } from './format';
import { KIND_LABELS, kindOf, type MoneyKind } from './money';
import type { Moment } from './moments';
import type { Opportunity, Recovered } from './types';

// Proof: what came back, and from where. Only money marked used (by you, or spotted on a receipt) counts;
// estimates never do. Pure, so every rule is tested.

export interface SourceLine {
  kind: MoneyKind | 'manual';
  label: string;
  total: MoneyBag;
  count: number;
}

const inRange = (iso: string, from: Date, to: Date) => {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
};

/** What came back between two dates, by where it came from, biggest first. */
export function savedBySource(opportunities: Pick<Opportunity, 'id' | 'type' | 'currency'>[], recovered: Pick<Recovered, 'opportunity_id' | 'amount' | 'currency' | 'recovered_at'>[], from: Date, to: Date): SourceLine[] {
  const byId = new Map(opportunities.map((o) => [o.id, o]));
  const lines = new Map<SourceLine['kind'], SourceLine>();
  for (const r of recovered) {
    if (!inRange(r.recovered_at, from, to) || !(r.amount > 0)) continue;
    const o = r.opportunity_id ? byId.get(r.opportunity_id) : undefined;
    const kind: SourceLine['kind'] = o ? kindOf(o) : 'manual';
    const line = lines.get(kind) ?? { kind, label: kind === 'manual' ? 'Added by you' : KIND_LABELS[kind], total: {}, count: 0 };
    addToBag(line.total, o?.currency ?? r.currency, r.amount);
    line.count += 1;
    lines.set(kind, line);
  }
  const size = (l: SourceLine) => Math.max(0, ...Object.values(l.total));
  return [...lines.values()].sort((a, b) => size(b) - size(a));
}

/** How many of them PerkScan noticed on a receipt by itself (no tap needed). */
export function spottedOnReceipts(recovered: Pick<Recovered, 'marked_by' | 'recovered_at'>[], from: Date, to: Date): number {
  return recovered.filter((r) => r.marked_by === 'auto' && inRange(r.recovered_at, from, to)).length;
}

/** "Card credits $40 · Refunds $70": the breakdown in one line. */
export const sourceLine = (lines: SourceLine[], home: string) => lines.map((l) => `${l.label} ${formatBag(l.total, home)}`).join(' · ');

/**
 * On the 1st, "Your October recap": what came back last month, by source. Only when something did,
 * so nobody gets a $0 nudge. Planned from what's known when the app last synced, so it says "at least".
 */
export function planRecapMoment(opportunities: Pick<Opportunity, 'id' | 'type' | 'currency'>[], recovered: Pick<Recovered, 'opportunity_id' | 'amount' | 'currency' | 'recovered_at'>[], now: Date, home: string): Moment | null {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lines = savedBySource(opportunities, recovered, start, next);
  if (!lines.length) return null;
  const total: MoneyBag = {};
  for (const l of lines) for (const [cur, v] of Object.entries(l.total)) addToBag(total, cur, v);
  const month = start.toLocaleDateString('en-US', { month: 'long' });
  const fireAt = new Date(next);
  fireAt.setHours(9, 0, 0, 0);
  return {
    id: `recap-${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    opportunityId: null,
    route: '/recap?offset=-1',
    fireAt,
    title: `Your ${month} recap: at least ${formatBag(total, home)} back`,
    body: `${sourceLine(lines.slice(0, 3), home)}. Tap to see where it came from.`,
  };
}
