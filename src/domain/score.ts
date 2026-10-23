import { confidenceOf } from './confidence';
import { CATEGORY_ORDER, type Opportunity, type OpportunityCategory, type Recovered } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CategoryScore {
  category: OpportunityCategory;
  leftOnTable: number;
  atRisk: number;
  available: number;
  count: number;
}

export interface Score {
  /** Expired (or open past due) this calendar year, minus anything recovered on them. */
  leftOnTable: number;
  /** Open, not yet used, expiring within the next 7 days. */
  atRiskThisWeek: number;
  atRiskItems: Opportunity[];
  /** Still open and not at risk yet. */
  available: number;
  recoveredThisYear: number;
  recoveredAllTime: number;
  byCategory: CategoryScore[];
  /** Open or missed card credits whose amount isn't verified, so they count as $0. */
  unverifiedCount: number;
  /** Share of this year's finished value you actually used: recovered / (recovered + left). Null with no history. */
  captureRate: number | null;
}

/** What's left of an opportunity after any recovered amount. Unknown values count as 0. */
export function remainingValue(opp: Opportunity, recoveredByOpp: Map<string, number>): number {
  if (opp.value_estimate === null) return 0;
  return Math.max(0, opp.value_estimate - (recoveredByOpp.get(opp.id) ?? 0));
}

export function isPastDue(opp: Opportunity, now: Date): boolean {
  return opp.expires_at !== null && new Date(opp.expires_at).getTime() <= now.getTime();
}

/** "Missed" = expired, or still open after its deadline (the hourly sync may not have run yet). */
export function isMissed(opp: Opportunity, now: Date): boolean {
  return opp.status === 'expired' || (opp.status === 'open' && isPastDue(opp, now));
}

export function isAtRisk(opp: Opportunity, now: Date, days = 7): boolean {
  if (opp.status !== 'open' || opp.expires_at === null) return false;
  const t = new Date(opp.expires_at).getTime();
  return t > now.getTime() && t <= now.getTime() + days * DAY_MS;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One score per currency, since amounts are never converted. The home currency
 * comes first, then the rest by how much is at stake.
 */
export function scoreByCurrency(opportunities: Opportunity[], recovered: Recovered[], now: Date, home: string): { currency: string; score: Score }[] {
  const currencies = new Set<string>([home]);
  for (const o of opportunities) currencies.add(o.currency);
  for (const r of recovered) currencies.add(r.currency);
  const byOpp = new Map(opportunities.map((o) => [o.id, o.currency]));
  return [...currencies]
    .map((currency) => ({
      currency,
      score: computeScore(
        opportunities.filter((o) => o.currency === currency),
        recovered.filter((r) => (r.opportunity_id ? byOpp.get(r.opportunity_id) ?? r.currency : r.currency) === currency),
        now,
      ),
    }))
    .sort((a, b) => (a.currency === home ? -1 : b.currency === home ? 1 : b.score.leftOnTable + b.score.available - (a.score.leftOnTable + a.score.available)));
}

export function computeScore(opportunities: Opportunity[], recovered: Recovered[], now: Date): Score {
  const year = now.getFullYear();
  const recoveredByOpp = new Map<string, number>();
  for (const r of recovered) {
    if (r.opportunity_id) recoveredByOpp.set(r.opportunity_id, (recoveredByOpp.get(r.opportunity_id) ?? 0) + r.amount);
  }

  const cats = new Map<OpportunityCategory, CategoryScore>(
    CATEGORY_ORDER.map((c) => [c, { category: c, leftOnTable: 0, atRisk: 0, available: 0, count: 0 }]),
  );

  let leftOnTable = 0;
  let atRiskThisWeek = 0;
  let available = 0;
  let unverifiedCount = 0;
  const atRiskItems: Opportunity[] = [];

  for (const opp of opportunities) {
    if (opp.status === 'dismissed' || opp.status === 'claimed') continue;
    const cat = cats.get(opp.category)!;
    // Guesses ("charged twice?", unconfirmed rules) never count as money available or missed.
    const remaining = confidenceOf(opp) === 'check' ? 0 : remainingValue(opp, recoveredByOpp);

    if (isMissed(opp, now)) {
      // Only this year's misses count toward the headline.
      if (opp.expires_at === null || new Date(opp.expires_at).getFullYear() !== year) continue;
      leftOnTable += remaining;
      cat.leftOnTable += remaining;
      cat.count += 1;
      if (opp.type === 'card_credit' && opp.value_estimate === null) unverifiedCount += 1;
    } else if (opp.status === 'open') {
      if (opp.type === 'card_credit' && opp.value_estimate === null) unverifiedCount += 1;
      cat.count += 1;
      if (isAtRisk(opp, now)) {
        atRiskThisWeek += remaining;
        cat.atRisk += remaining;
        atRiskItems.push(opp);
      } else {
        available += remaining;
        cat.available += remaining;
      }
    }
  }

  atRiskItems.sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime());

  let recoveredThisYear = 0;
  let recoveredAllTime = 0;
  for (const r of recovered) {
    recoveredAllTime += r.amount;
    if (new Date(r.recovered_at).getFullYear() === year) recoveredThisYear += r.amount;
  }

  return {
    leftOnTable: round2(leftOnTable),
    atRiskThisWeek: round2(atRiskThisWeek),
    atRiskItems,
    available: round2(available),
    recoveredThisYear: round2(recoveredThisYear),
    recoveredAllTime: round2(recoveredAllTime),
    byCategory: [...cats.values()].map((c) => ({
      ...c,
      leftOnTable: round2(c.leftOnTable),
      atRisk: round2(c.atRisk),
      available: round2(c.available),
    })),
    unverifiedCount,
    captureRate:
      recoveredThisYear + leftOnTable > 0 ? Math.round((recoveredThisYear / (recoveredThisYear + leftOnTable)) * 100) / 100 : null,
  };
}
