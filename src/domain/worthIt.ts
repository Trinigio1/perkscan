import type { BenefitPeriod, CardBenefit } from './types';

export const PERIODS_PER_YEAR: Record<Exclude<BenefitPeriod, 'per_claim'>, number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

/** Full-year value of a periodic credit, or null when the amount isn't verified. */
export function annualCreditValue(b: Pick<CardBenefit, 'amount' | 'period' | 'amount_schedule'>): number | null {
  if (b.amount === null || b.period === 'per_claim') return null;
  if (b.period === 'monthly' && b.amount_schedule) {
    let total = 0;
    for (let m = 1; m <= 12; m++) total += b.amount_schedule[String(m)] ?? b.amount;
    return total;
  }
  return b.amount * PERIODS_PER_YEAR[b.period];
}

export interface WorthItCredit {
  benefitId: string;
  name: string;
  annualValue: number | null;
  /** 0..1 — how much of this credit the user expects to actually use. */
  useRate: number;
}

export type Verdict = 'worth_it' | 'borderline' | 'not_worth_it' | 'unknown';

export interface WorthItResult {
  annualFee: number | null;
  /** Value if every verified credit were fully used. */
  maxValue: number;
  /** Value at the user's expected use rates. */
  expectedValue: number;
  net: number | null;
  verdict: Verdict;
  /** Share of total verified credit value the user must use to break even, if achievable. */
  breakEvenRate: number | null;
  unverifiedCount: number;
}

/**
 * Estimates whether credits cover the annual fee. Only verified credit amounts count.
 * Points earned, protections and perks are excluded on purpose: their value depends
 * on spending and luck, so the verdict stays conservative.
 */
export function computeWorthIt(annualFee: number | null, credits: WorthItCredit[]): WorthItResult {
  let maxValue = 0;
  let expectedValue = 0;
  let unverifiedCount = 0;
  for (const c of credits) {
    if (c.annualValue === null) {
      unverifiedCount += 1;
      continue;
    }
    const rate = Math.min(1, Math.max(0, c.useRate));
    maxValue += c.annualValue;
    expectedValue += c.annualValue * rate;
  }
  maxValue = Math.round(maxValue * 100) / 100;
  expectedValue = Math.round(expectedValue * 100) / 100;

  if (annualFee === null) {
    return { annualFee, maxValue, expectedValue, net: null, verdict: 'unknown', breakEvenRate: null, unverifiedCount };
  }

  const net = Math.round((expectedValue - annualFee) * 100) / 100;
  const margin = Math.max(25, annualFee * 0.1);
  let verdict: Verdict;
  if (annualFee === 0) verdict = 'worth_it';
  else if (net > margin) verdict = 'worth_it';
  else if (net < -margin) verdict = 'not_worth_it';
  else verdict = 'borderline';

  // With nothing verified we can't say a fee card is not worth it.
  if (annualFee > 0 && maxValue === 0 && unverifiedCount > 0) verdict = 'unknown';

  const breakEvenRate = maxValue > 0 && annualFee <= maxValue ? annualFee / maxValue : null;
  return { annualFee, maxValue, expectedValue, net, verdict, breakEvenRate, unverifiedCount };
}

/**
 * Default use rate from history: share of tracked periods where the credit was
 * fully or partly used. Falls back to 0.5 when there's no history yet.
 */
export function historicalUseRate(trackedPeriods: number, usedValue: number, trackedValue: number): number {
  if (trackedPeriods === 0 || trackedValue <= 0) return 0.5;
  return Math.min(1, Math.max(0, usedValue / trackedValue));
}
