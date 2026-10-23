import type { Found } from './extract.ts';
import { sameSite } from './page.ts';

// The gates every scouted item must pass before anyone sees it. They replace a human reviewer:
//   - the quoted evidence is really on the official page
//   - every number in the headline is in that quote (no invented amounts)
//   - amounts, percentages, codes and dates are each found on the page, or dropped
//   - it hasn't ended, and its dates make sense
//   - it's something concrete (an amount, a percentage, a code, or "free")
// Pure, so every rule is tested.

export interface SourceIn {
  id: string;
  name: string;
  kind: 'store' | 'bank' | 'government';
  url: string;
  countries: string[];
  regions: string[];
  categories: string[];
  merchants: string[];
  issuers: string[];
  card_keywords: string[];
}

export interface Checked {
  key: string;
  title: string;
  summary: string | null;
  category: Found['category'];
  event_kind: Found['event_kind'];
  amount: number | null;
  percent_off: number | null;
  currency: string | null;
  code: string | null;
  min_spend: number | null;
  starts_on: string | null;
  ends_on: string | null;
  url: string;
  evidence: string;
  /** confirmed: a stated amount, percentage or code. check: only "free", "sale" and the like. */
  confidence: 'confirmed' | 'check';
}

export type CheckResult = { ok: true; value: Checked } | { ok: false; reason: string };

/** Lower case, one kind of quote and dash, single spaces — so a faithful quote matches the page. */
export function norm(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[​-‍﻿­]/g, '')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Every number written in the text: "1,299.99" -> 1299.99, "TT$300" -> 300. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, '')));
}
const hasNumber = (text: string, n: number) => numbersIn(text).some((x) => Math.abs(x - n) < 0.005);
const hasPercent = (text: string, p: number) =>
  [...norm(text).matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)/g)].some((m) => Math.abs(Number(m[1]) - p) < 0.005);

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Whether the text states this date: "Oct 31", "31st October", "10/31", "31/10" or "2026-10-31". */
export function statesDate(text: string, iso: string): boolean {
  const t = norm(text);
  const [, m, d] = iso.split('-').map(Number) as [number, number, number];
  if (t.includes(iso)) return true;
  const day = `0?${d}`;
  if (new RegExp(`(^|[^\\d])(${day}[/.-]0?${m}|0?${m}[/.-]${day})([/.-](\\d{2}|\\d{4}))?($|[^\\d])`).test(t)) return true;
  const name = MONTHS[m - 1]!;
  const month = `(${name}|${name.slice(0, 3)}\\.?)`;
  const dayWord = `0?${d}(st|nd|rd|th)?`;
  // "Oct 31", "October 31st", "31 October", "31st of Oct." — the day right next to the month.
  return new RegExp(`\\b${month}\\s*${dayWord}($|[^\\d])|(^|[^\\d])${dayWord}\\s+(of\\s+)?${month}\\b`).test(t);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (s: string | null): s is string => !!s && ISO.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/** Short stable hash (FNV-1a) so the same promotion keeps the same key run after run. */
export function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const CONCRETE_WORDS = /\b(free|buy one|bogo|half[- ]price|cash ?back)\b/i;

export function checkFound(f: Found, ctx: { page: string; source: SourceIn; today: string; defaultCurrency: string | null }): CheckResult {
  const page = norm(ctx.page);
  const evidence = f.evidence.replace(/\s+/g, ' ').trim();
  if (norm(evidence).length < 12) return { ok: false, reason: 'evidence too short' };
  if (evidence.length > 600) return { ok: false, reason: 'evidence too long' };
  if (!page.includes(norm(evidence))) return { ok: false, reason: 'evidence not on page' };

  const title = f.title.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!title) return { ok: false, reason: 'no title' };
  // No number in the headline that the quote doesn't contain.
  if (numbersIn(title).some((n) => !hasNumber(evidence, n))) return { ok: false, reason: 'headline number not in evidence' };
  let summary: string | null = f.summary.replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  if (summary && numbersIn(summary).some((n) => !hasNumber(ctx.page, n))) summary = null;

  const amount = f.amount !== null && f.amount > 0 && f.amount <= 100_000 && hasNumber(evidence, f.amount) ? Math.round(f.amount * 100) / 100 : null;
  const percent = f.percent_off !== null && f.percent_off > 0 && f.percent_off <= 100 && hasPercent(evidence, f.percent_off) ? f.percent_off : null;
  const minSpend = f.min_spend !== null && f.min_spend > 0 && hasNumber(ctx.page, f.min_spend) ? Math.round(f.min_spend * 100) / 100 : null;
  const rawCode = f.code?.trim() ?? '';
  const code = /^[A-Za-z0-9-]{3,40}$/.test(rawCode) && new RegExp(`(^|[^A-Za-z0-9-])${rawCode}($|[^A-Za-z0-9-])`).test(ctx.page) ? rawCode : null;
  const cur = f.currency?.trim().toUpperCase() ?? '';
  const currency = amount !== null || minSpend !== null ? (/^[A-Z]{3}$/.test(cur) ? cur : ctx.defaultCurrency) : null;

  let ends = validIso(f.ends_on) && statesDate(ctx.page, f.ends_on) ? f.ends_on : null;
  let starts = validIso(f.starts_on) && statesDate(ctx.page, f.starts_on) ? f.starts_on : null;
  if (ends && ends < ctx.today) return { ok: false, reason: 'already ended' };
  if (ends && ends > addDays(ctx.today, 400)) ends = null;
  if (starts && ends && starts > ends) starts = ends = null;
  if (starts && starts > addDays(ctx.today, 180)) return { ok: false, reason: 'too far ahead' };

  const concrete = amount !== null || percent !== null || code !== null;
  // Government pages list dated things to do (enrollment, deadlines); stores and banks must offer something.
  if (!concrete && ctx.source.kind !== 'government' && !CONCRETE_WORDS.test(evidence)) return { ok: false, reason: 'nothing concrete' };
  // Bank and government items are dated events: no end date, no event.
  if (ctx.source.kind !== 'store' && !ends) return { ok: false, reason: 'event without a stated end date' };

  const link = f.link?.trim() ?? '';
  const url = /^https:\/\/\S+$/.test(link) && sameSite(link, ctx.source.url) && ctx.page.includes(link) ? link : ctx.source.url;

  return {
    ok: true,
    value: {
      key: stableHash(`${norm(title)}|${code ?? ''}|${ends ?? ''}`),
      title,
      summary,
      category: f.category,
      event_kind: f.event_kind,
      amount,
      percent_off: percent,
      currency,
      code,
      min_spend: minSpend,
      starts_on: starts,
      ends_on: ends,
      url,
      evidence,
      confidence: concrete ? 'confirmed' : 'check',
    },
  };
}
