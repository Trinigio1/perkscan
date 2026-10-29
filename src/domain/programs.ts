// "Hidden money": the programs catalog, filtered to where you live and grouped by what to do.

export type ProgramKind = 'loyalty' | 'price_adjust' | 'unclaimed' | 'library' | 'refund_rule' | 'deadline_rule' | 'free_perk';

export interface Program {
  id: string;
  kind: ProgramKind;
  name: string;
  provider: string;
  countries: string[];
  summary: string;
  how_to: string;
  url: string;
  merchants: string[];
  window_days: number | null;
  /** Interest ids it matters for. */
  interests: string[];
  /** Card issuers whose cardholders get it; empty = anyone. */
  issuers: string[];
  student_only: boolean;
  status: 'active' | 'TODO_VERIFY';
  last_verified: string | null;
  sort_order: number;
  /** 'scout': found by PerkScan on the store's own site, with the page's words in `evidence`. */
  origin?: 'catalog' | 'scout';
  evidence?: string | null;
}

export const PROGRAM_SECTIONS: { kind: ProgramKind; title: string }[] = [
  { kind: 'unclaimed', title: 'Money waiting in your name' },
  { kind: 'loyalty', title: 'Points and miles that expire' },
  { kind: 'deadline_rule', title: 'Use it or lose it' },
  { kind: 'price_adjust', title: 'Price drops after you buy' },
  { kind: 'refund_rule', title: 'Refunds you may be owed' },
  { kind: 'library', title: 'Free with a library card' },
];

/**
 * The sections for a country: programs for it or for anywhere, verified ones first.
 * With no country (or "somewhere else"), everything is shown.
 */
export function programSections(programs: Program[], country: string | null) {
  const here = (p: Program) => !country || country === 'ZZ' || !p.countries.length || p.countries.includes(country);
  const sorted = [...programs].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || a.sort_order - b.sort_order);
  return PROGRAM_SECTIONS.map((s) => ({ ...s, programs: sorted.filter((p) => p.kind === s.kind && here(p)) })).filter((s) => s.programs.length);
}

/** What can be added by hand; promos come from "Remind me" on an event rather than the Add list. */
export type AddType = 'points' | 'gift_card' | 'store_credit' | 'benefit' | 'refund' | 'promo';

export const ADD_TYPES: { type: AddType; title: string; example: string }[] = [
  { type: 'points', title: 'Points or miles', example: 'Massy Card, AAdvantage, Starbucks Stars' },
  { type: 'gift_card', title: 'Gift card', example: 'A balance you haven’t used' },
  { type: 'store_credit', title: 'Store credit', example: 'From a return or a goodwill credit' },
  { type: 'benefit', title: 'Use-it-or-lose-it benefit', example: 'FSA, work allowance, birthday reward' },
  { type: 'refund', title: 'Refund you’re owed', example: 'A cancelled flight, an overcharge' },
];

/** "12,000 Massy Card points" for points; the user's own words otherwise. */
export function itemTitle(type: AddType, title: string, points: number | null, program: Pick<Program, 'name'> | null): string {
  const name = title.trim() || program?.name || '';
  if (type === 'points' && points) return `${points.toLocaleString('en-US')} ${name || 'points'}`.trim();
  return name;
}

/** A YYYY-MM-DD date that exists, or null. */
export function parseDay(s: string): string | null {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? null : t;
}

/** "1,250.50" or "TT$85" → 1250.5; blank → null; anything else → NaN. */
export function parseAmount(s: string): number | null {
  const t = s.replace(/[^0-9.]/g, '');
  if (!s.trim()) return null;
  const n = Number(t);
  return t && Number.isFinite(n) ? n : NaN;
}
