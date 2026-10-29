import type { Missed } from './earn';
import type { Owed } from './money';
import type { MembershipHint, PayingTwice } from './subscriptions';

// The first scan: what PerkScan found the moment a bank (or email) is connected, in one list.
// The headline is only money you can still get: owed to you, card credits open now, and charges a
// membership or card already covers. What the wrong card cost in the past is shown, never added in.
// Pure, so every rule is tested.

export interface ScanLine {
  key: 'owed' | 'credits' | 'twice' | 'missed' | 'memberships' | 'cards' | 'subscriptions';
  title: string;
  detail: string;
  /** Dollars, when known. */
  amount: number | null;
  /** Counted in the headline (money you can still get). */
  counts: boolean;
  route: string;
}

export interface ScanInput {
  owed: Owed;
  /** Card credits open now with a known amount left. */
  creditsOpen: { total: number; count: number };
  payingTwice: PayingTwice[];
  missed: Missed;
  memberships: MembershipHint[];
  spottedCards: number;
  subscriptions: { count: number; yearly: number };
  currency: string;
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function scanLines(d: ScanInput): { lines: ScanLine[]; total: number } {
  const lines: ScanLine[] = [];
  const owed = d.owed.total[d.currency] ?? 0;
  if (d.owed.count) {
    lines.push({ key: 'owed', title: owed ? `${money(owed)} owed to you` : `${plural(d.owed.count, 'refund')} owed to you`, detail: 'Refunds, price drops and settlements to ask for.', amount: owed || null, counts: true, route: '/money' });
  }
  if (d.creditsOpen.count) {
    lines.push({ key: 'credits', title: `${money(d.creditsOpen.total)} in card credits to use`, detail: `${plural(d.creditsOpen.count, 'credit')} open now, before they reset.`, amount: d.creditsOpen.total, counts: true, route: '/money' });
  }
  if (d.payingTwice.length) {
    const save = Math.round(d.payingTwice.reduce((n, p) => n + p.saving, 0) * 100) / 100;
    lines.push({ key: 'twice', title: `${money(save)} you’re paying twice`, detail: `${d.payingTwice.map((p) => p.charge.service.name).slice(0, 2).join(', ')}: already included with something you have.`, amount: save, counts: true, route: '/subscriptions' });
  }
  if (d.missed.count) {
    const b = d.missed.biggest!;
    lines.push({
      key: 'missed',
      title: `${money(d.missed.total)} more with the right card`,
      detail: `On ${plural(d.missed.count, 'purchase')} in the last 90 days. Biggest: ${b.merchant}, where another card earns ${b.best.label}. Before you pay shows which to use.`,
      amount: d.missed.total,
      counts: false,
      route: '/checkout',
    });
  }
  if (d.memberships.length) {
    lines.push({ key: 'memberships', title: `You pay for ${d.memberships.map((m) => m.name).slice(0, 2).join(' and ')}${d.memberships.length > 2 ? '…' : ''}`, detail: d.memberships.length === 1 ? 'Add it to see the perks and credits it includes.' : 'Add them to see the perks and credits they include.', amount: null, counts: false, route: '/memberships' });
  }
  if (d.spottedCards) {
    lines.push({ key: 'cards', title: `${plural(d.spottedCards, 'card')} found in your bank`, detail: d.spottedCards === 1 ? 'Add it to unlock its credits and protections.' : 'Add them to unlock their credits and protections.', amount: null, counts: false, route: '/cards' });
  }
  if (d.subscriptions.count) {
    lines.push({ key: 'subscriptions', title: `${plural(d.subscriptions.count, 'subscription')}, ${money(Math.round(d.subscriptions.yearly))} a year`, detail: 'Every recurring charge in one place.', amount: null, counts: false, route: '/subscriptions' });
  }
  const total = Math.round(lines.filter((l) => l.counts && l.amount).reduce((n, l) => n + l.amount!, 0) * 100) / 100;
  return { lines, total };
}
