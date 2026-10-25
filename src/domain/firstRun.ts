import { confidenceOf, type BenefitStatusOf } from './confidence';
import { addToBag, type MoneyBag } from './format';
import { KIND_LABELS, kindOf, viewOf, type MoneyKind, type SetupStep } from './money';
import type { Opportunity, Recovered } from './types';

// What a new user sees first: the one next thing to do, how many perks still need checking,
// and what PerkScan found for them. Pure, so every rule is tested.

/** The first setup step still to do, or null once everything is set up. */
export const nextStep = (steps: SetupStep[]): SetupStep | null => steps.find((s) => !s.done) ?? null;

/** Open items whose amount or terms aren't confirmed yet (shown as "Check"), protections aside. */
export function toCheckCount(opportunities: Opportunity[], now: Date, statusOf?: BenefitStatusOf): number {
  return opportunities.filter((o) => o.type !== 'protection' && viewOf(o, now) === 'open' && confidenceOf(o, statusOf) === 'check').length;
}

// ---- "We found $X": the first big moment, once the cards and inbox are in.

export interface FoundGroup {
  kind: MoneyKind;
  label: string;
  /** Counted money in this group, per currency. */
  total: MoneyBag;
  /** Biggest first, then soonest to expire. */
  items: Opportunity[];
}

export interface FoundMoney {
  /** Open money PerkScan can stand behind (guesses and unknown amounts left out), per currency. */
  total: MoneyBag;
  groups: FoundGroup[];
  /** Open items in the groups, counted or not. */
  itemCount: number;
  /** Open items PerkScan isn't sure about yet: listed, never counted. */
  toCheck: number;
  /** Purchases a card protection covers. Not money until you claim, so they're only mentioned. */
  protectedCount: number;
  /** Money that already expired unused this year. */
  missed: MoneyBag;
  /** Cards and emails it came from. */
  cards: number;
  emails: number;
}

// Protections and return windows aren't money until something goes wrong; they're mentioned, not added up.
const NOT_MONEY: MoneyKind[] = ['protections', 'returns'];

const remaining = (o: Opportunity, recoveredByOpp: Map<string, number>) =>
  o.value_estimate === null ? 0 : Math.max(0, o.value_estimate - (recoveredByOpp.get(o.id) ?? 0));

export function foundMoney(opportunities: Opportunity[], recovered: Recovered[], now: Date, statusOf?: BenefitStatusOf): FoundMoney {
  const recoveredByOpp = new Map<string, number>();
  for (const r of recovered) if (r.opportunity_id) recoveredByOpp.set(r.opportunity_id, (recoveredByOpp.get(r.opportunity_id) ?? 0) + r.amount);
  // What an item adds to the total: nothing for guesses or unknown amounts.
  const counted = (o: Opportunity) => (confidenceOf(o, statusOf) === 'check' ? 0 : remaining(o, recoveredByOpp));

  const total: MoneyBag = {};
  const missed: MoneyBag = {};
  const groups = new Map<MoneyKind, FoundGroup>();
  const cards = new Set<string>();
  const emails = new Set<string>();
  let toCheck = 0;
  let protectedCount = 0;

  for (const o of opportunities) {
    const view = viewOf(o, now);
    if (view === 'missed') {
      if (counted(o) > 0) addToBag(missed, o.currency, counted(o));
      continue;
    }
    if (view !== 'open') continue;
    const kind = kindOf(o);
    if (NOT_MONEY.includes(kind)) {
      if (kind === 'protections') protectedCount += 1;
      continue;
    }
    if (o.user_card_id) cards.add(o.user_card_id);
    if (o.source_message_id) emails.add(o.source_message_id);
    const value = counted(o);
    if (confidenceOf(o, statusOf) === 'check') toCheck += 1;
    const g = groups.get(kind) ?? { kind, label: KIND_LABELS[kind], total: {}, items: [] };
    if (value > 0) {
      addToBag(g.total, o.currency, value);
      addToBag(total, o.currency, value);
    }
    g.items.push(o);
    groups.set(kind, g);
  }

  const sum = (b: MoneyBag) => Object.values(b).reduce((s, v) => s + v, 0);
  const expiry = (o: Opportunity) => (o.expires_at ? new Date(o.expires_at).getTime() : Infinity);
  for (const g of groups.values()) g.items.sort((a, b) => counted(b) - counted(a) || expiry(a) - expiry(b));
  const list = [...groups.values()].sort((a, b) => sum(b.total) - sum(a.total) || b.items.length - a.items.length);
  return {
    total,
    groups: list,
    itemCount: list.reduce((s, g) => s + g.items.length, 0),
    toCheck,
    protectedCount,
    missed,
    cards: cards.size,
    emails: emails.size,
  };
}

const SINGULAR: Partial<Record<MoneyKind, string>> = {
  credits: 'card credit', codes: 'code', gift_cards: 'gift card', refunds: 'refund', benefits: 'benefit', points: 'points balance',
};

/** "4 card credits", "1 gift card", "2 points & miles". */
export function countLabel(kind: MoneyKind, n: number): string {
  const one = SINGULAR[kind];
  return one ? `${n} ${n === 1 ? one : `${one}s`}` : `${n} ${KIND_LABELS[kind].toLowerCase()}`;
}

/** Worth a "We found" moment: something confirmed to use, or at least a few things to look at. */
export const worthCelebrating = (f: FoundMoney) => Object.values(f.total).some((v) => v > 0) || f.itemCount >= 3;

/** How long after finishing setup someone first saw what PerkScan found, in coarse buckets (no timestamps sent). */
export function activationBucket(since: string | null | undefined, now: Date): 'under_5m' | 'under_30m' | 'same_day' | 'later' | 'unknown' {
  if (!since) return 'unknown';
  const minutes = (now.getTime() - new Date(since).getTime()) / 60_000;
  if (!Number.isFinite(minutes) || minutes < 0) return 'unknown';
  if (minutes < 5) return 'under_5m';
  if (minutes < 30) return 'under_30m';
  if (minutes < 24 * 60) return 'same_day';
  return 'later';
}
