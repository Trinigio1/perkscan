import type { Confidence } from './confidence';

// "Coming up near you": dated, money-related events where you live — free days, enrollment
// windows, deadlines, and bank promotions for the cards you hold.

export interface LocalEvent {
  id: string;
  title: string;
  summary: string;
  category: 'bank_promo' | 'free_day' | 'enrollment' | 'deadline' | 'sale' | 'student';
  countries: string[];
  regions: string[];
  issuers: string[];
  card_keywords: string[];
  starts_on: string;
  ends_on: string;
  url: string;
  status: 'confirmed' | 'expected';
  based_on: string | null;
  last_verified: string;
}

export interface EventFor {
  /** Your country and (US) state. */
  country: string | null;
  region?: string | null;
  /** The cards you hold: their issuer and product name. */
  cards: { issuer: string; product_name: string }[];
  today: string; // YYYY-MM-DD
  /** How far ahead to look. */
  horizonDays?: number;
}

const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/**
 * Events that apply to you and are on now or start soon: your country, your state if it's
 * state-specific, and bank promotions only for banks whose cards you hold. Happening now first
 * (ending soonest), then by start date.
 */
export function relevantEvents(events: LocalEvent[], who: EventFor): LocalEvent[] {
  const until = addDays(who.today, who.horizonDays ?? 45);
  return events
    .filter((e) => !!who.country && e.countries.includes(who.country))
    .filter((e) => !e.regions.length || (!!who.region && e.regions.includes(who.region)))
    // Bank promotions only for holders of that bank's cards — and of the right card type.
    // Network promotions (e.g. any Mastercard) have keywords but no issuer.
    .filter((e) => (!e.issuers.length && !e.card_keywords.length) || who.cards.some((c) => (!e.issuers.length || e.issuers.includes(c.issuer)) && (!e.card_keywords.length || e.card_keywords.some((k) => c.product_name.toLowerCase().includes(k)))))
    .filter((e) => e.ends_on >= who.today && e.starts_on <= until)
    .sort((a, b) => {
      const aNow = a.starts_on <= who.today;
      const bNow = b.starts_on <= who.today;
      if (aNow !== bNow) return aNow ? -1 : 1;
      return aNow ? a.ends_on.localeCompare(b.ends_on) : a.starts_on.localeCompare(b.starts_on);
    });
}

/** Announced events are confirmed; recurring ones not yet announced are worth checking. */
export const eventConfidence = (e: Pick<LocalEvent, 'status'>): Confidence => (e.status === 'confirmed' ? 'confirmed' : 'check');

const fmt = (d: string, withYear = false) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

/** "Today", "Tomorrow", "Oct 27", "Ends in 3 days", "Until Dec 7", "Nov 1 – Jan 15". */
export function eventWhen(e: Pick<LocalEvent, 'starts_on' | 'ends_on'>, today: string): string {
  const oneDay = e.starts_on === e.ends_on;
  if (e.starts_on <= today) {
    const left = daysBetween(today, e.ends_on);
    if (left === 0) return oneDay ? 'Today' : 'Ends today';
    if (left === 1) return 'Ends tomorrow';
    return left <= 7 ? `Ends in ${left} days` : `Until ${fmt(e.ends_on)}`;
  }
  if (daysBetween(today, e.starts_on) === 1 && oneDay) return 'Tomorrow';
  if (oneDay) return fmt(e.starts_on);
  const crossesYear = e.starts_on.slice(0, 4) !== e.ends_on.slice(0, 4);
  return `${fmt(e.starts_on)} – ${fmt(e.ends_on, crossesYear)}`;
}

/** What a reminder for this event becomes in your list. */
export function reminderFor(e: LocalEvent): { type: 'promo' | 'benefit'; title: string; expiresOn: string; note: string; unconfirmed: boolean } {
  return {
    type: e.category === 'bank_promo' || e.category === 'sale' ? 'promo' : 'benefit',
    title: e.title,
    expiresOn: e.ends_on,
    note: e.summary,
    // Not announced yet: the reminder stays "Check" there too.
    unconfirmed: e.status === 'expected',
  };
}
