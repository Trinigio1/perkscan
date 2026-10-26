import { shortCardName } from './format';
import type { Program } from './programs';
import type { Card, CardBenefit, Opportunity, Receipt, StudentOffer, University, UserCard } from './types';
import type { IconTone } from './visuals';

// "For you": things you probably qualify for, worked out from what PerkScan already knows —
// where you live, your school, your cards, and who emails you. Pure, so every rule is tested.

export type SuggestionIcon = 'school' | 'star' | 'airplane' | 'search' | 'hourglass' | 'library';

export interface Suggestion {
  /** Stable, so a dismissal sticks. */
  id: string;
  icon: SuggestionIcon;
  tone: IconTone;
  title: string;
  body: string;
  action: { label: string; pathname: '/student' | '/add-item' | '/perks' | '/hidden-money'; params?: Record<string, string> };
}

export interface SuggestionInput {
  country: string | null;
  isStudent: boolean;
  school: University | null;
  /** Schools whose email domains send you mail. */
  schoolHints: University[];
  studentOffers: StudentOffer[];
  studentClaims: string[];
  programs: Program[];
  opportunities: Opportunity[];
  receipts: Pick<Receipt, 'merchant'>[];
  /** Domains that have emailed you, e.g. "email.marriott.com". */
  senderDomains: string[];
  userCards: Pick<UserCard, 'id' | 'card_id'>[];
  cards: Pick<Card, 'id' | 'product_name'>[];
  benefits: Pick<CardBenefit, 'id' | 'card_id'>[];
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const forCountry = (p: Program, country: string | null) => !p.countries.length || (!!country && p.countries.includes(country));

/** Whether you deal with a program: its name shows up in a sender's domain or a store you bought from. */
export function usesProgram(p: Pick<Program, 'merchants'>, senderDomains: string[], merchants: string[]): boolean {
  // Whole domain labels only: "email.marriott.com" and "caribbean-airlines.com" match, "targetedmail.com" doesn't.
  const labels = new Set(senderDomains.flatMap((d) => d.toLowerCase().split('.').map(squash)));
  const stores = merchants.map((m) => ` ${m.toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim()} `);
  return p.merchants.some((m) => {
    const key = squash(m);
    return key.length >= 4 && (labels.has(key) || stores.some((s) => s.includes(` ${m} `)));
  });
}

/** Student offers for you not yet marked claimed: your school's own, and ones for where you live. */
export function openStudentOffers(d: Pick<SuggestionInput, 'studentOffers' | 'studentClaims' | 'school' | 'country'>): StudentOffer[] {
  return d.studentOffers.filter(
    (o) => !d.studentClaims.includes(o.id) &&
      (o.university_ids?.length ? !!d.school && o.university_ids.includes(d.school.id) : !o.countries.length || (!!d.country && o.countries.includes(d.country))),
  );
}

export function suggestions(d: SuggestionInput): Suggestion[] {
  const out: Suggestion[] = [];

  // School: you get email from a school's domain but haven't said you're a student.
  const hint = d.schoolHints[0];
  if (!d.isStudent && !d.school && hint) {
    out.push({
      id: `school:${hint.id}`,
      icon: 'school',
      tone: 'purple',
      title: `Studying at ${hint.short_name}?`,
      body: 'Students there get free software, streaming and travel discounts.',
      action: { label: 'See student perks', pathname: '/student' },
    });
  }
  if (d.isStudent) {
    const open = openStudentOffers(d).length;
    if (open) {
      out.push({
        id: 'student_offers',
        icon: 'school',
        tone: 'purple',
        title: `${open} student perk${open === 1 ? '' : 's'} to claim`,
        body: d.school ? `With your ${d.school.short_name} email.` : 'Pick your school to see the ones only for you.',
        action: { label: 'See them', pathname: '/student' },
      });
    }
  }

  // Loyalty programs you clearly use, with no balance tracked yet.
  const merchants = [...d.receipts.map((r) => r.merchant), ...d.opportunities.map((o) => o.merchant ?? '').filter(Boolean)];
  const tracked = d.opportunities.filter((o) => o.type === 'points' && o.status === 'open').map((o) => squash(`${o.title} ${o.merchant ?? ''}`));
  for (const p of d.programs.filter((x) => x.kind === 'loyalty' && forCountry(x, d.country))) {
    if (!usesProgram(p, d.senderDomains, merchants)) continue;
    if (tracked.some((t) => t.includes(squash(p.name)) || t.includes(squash(p.provider)))) continue;
    out.push({
      id: `loyalty:${p.id}`,
      icon: 'star',
      tone: 'purple',
      title: `Track your ${p.name} balance`,
      body: p.status === 'active' ? p.summary : `You deal with ${p.provider}. Add your balance so it doesn’t expire unnoticed.`,
      action: { label: 'Add balance', pathname: '/add-item', params: { type: 'points', program: p.id } },
    });
  }

  // Lounge access on a card you already have.
  const lounge = d.userCards.find((uc) => d.benefits.some((b) => b.card_id === uc.card_id && /lounge/.test(b.id)));
  if (lounge) {
    const name = shortCardName(d.cards.find((c) => c.id === lounge.card_id)?.product_name ?? 'card');
    out.push({
      id: 'lounges',
      icon: 'airplane',
      tone: 'blue',
      title: `Airport lounges with your ${name}`,
      body: 'Check how to get in before your next trip.',
      action: { label: 'See card perks', pathname: '/perks' },
    });
  }

  // Where you live: money held in your name, and use-it-or-lose-it deadlines.
  const unclaimed = d.programs.find((p) => p.kind === 'unclaimed' && p.status === 'active' && p.countries.length && forCountry(p, d.country));
  if (unclaimed) {
    out.push({
      id: `unclaimed:${unclaimed.id}`,
      icon: 'search',
      tone: 'green',
      title: 'Check for money in your name',
      body: `${unclaimed.name} — ${unclaimed.provider}. Free to check.`,
      action: { label: 'How to check', pathname: '/hidden-money' },
    });
  }
  const deadline = d.programs.find((p) => p.kind === 'deadline_rule' && p.countries.length && forCountry(p, d.country));
  if (deadline && !d.opportunities.some((o) => o.type === 'benefit' && o.status === 'open')) {
    out.push({
      id: `deadline:${deadline.id}`,
      icon: 'hourglass',
      tone: 'orange',
      title: `${deadline.name.split(':')[0]}? Add your balance`,
      body: 'PerkScan reminds you before the deadline.',
      action: { label: 'Add balance', pathname: '/add-item', params: { type: 'benefit', program: deadline.id } },
    });
  }
  const library = d.programs.find((p) => p.kind === 'library' && p.countries.length && forCountry(p, d.country));
  if (library) {
    out.push({
      id: `library:${library.id}`,
      icon: 'library',
      tone: 'pink',
      title: `Free with a ${library.name.replace(/ library card$/i, '')} card`,
      body: library.summary,
      action: { label: 'Learn more', pathname: '/hidden-money' },
    });
  }
  return out;
}

/** Sender domains plus their parents, so "sta.uwi.edu" also matches a school listed as "uwi.edu". */
export function domainsWithParents(domains: string[]): string[] {
  const all = new Set<string>();
  for (const d of domains) {
    const parts = d.toLowerCase().split('.');
    for (let i = 0; i <= parts.length - 2; i++) all.add(parts.slice(i).join('.'));
  }
  return [...all];
}
