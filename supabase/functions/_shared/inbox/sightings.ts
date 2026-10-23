import type { ParsedEmail } from './schema.ts';

// Public promotions from an email, for people who turned on "Help people nearby find deals":
// codes, and dated promotions with a stated amount or percentage. Only the store, the offer,
// the code and its dates leave the user's account — never the email, its sender address or
// who received it. A promotion only becomes visible to others once enough different people
// got the same one (see _promote_shared_deals), so offers made for one person (birthday
// rewards, referral and gift card codes) never show.

export interface Sighting {
  country: string;
  merchant: string;
  merchant_key: string;
  code: string | null;
  /** What makes two people's copies the same promotion: the code, or the number and end date. */
  offer_key: string;
  title: string;
  amount: number | null;
  percent_off: number | null;
  currency: string | null;
  min_spend: number | null;
  ends_on: string | null;
}

/** "COURTS (TRINIDAD) LTD" -> "courts". The same rule as public.store_key in the database. */
export const merchantKey = (m: string) =>
  m.toLowerCase().replace(/\b(ltd|limited|inc|llc|corp|company|the|trinidad|tobago|jamaica|barbados|usa)\b/g, ' ').replace(/[^a-z0-9]/g, '').slice(0, 60);

/** Words that mark an offer as made for one person. */
const PERSONAL = /\b(birthday|referr|refer a friend|gift card|your (own|personal|unique)|just for you|exclusive to you|welcome back)\b/i;

export function sightingsFrom(p: ParsedEmail, country: string | null, today: string): Sighting[] {
  if (!country || !/^[A-Z]{2}$/.test(country) || !p.merchant || p.kind !== 'promo') return [];
  const key = merchantKey(p.merchant);
  if (key.length < 2) return [];
  const out: Sighting[] = [];
  for (const o of p.offers) {
    if (o.type !== 'promo' || (o.amount === null && o.percent_off === null)) continue;
    if (o.expires_on && o.expires_on < today) continue;
    if (PERSONAL.test(`${o.title} ${o.details ?? ''} ${p.summary}`)) continue;
    const code = o.code ? o.code.toUpperCase() : null;
    // Without a code, a promotion is only recognisable by its number and end date.
    if (!code && !o.expires_on) continue;
    const offerKey = code ?? `${o.amount !== null ? `a${o.amount}` : `p${o.percent_off}`}:${o.expires_on}`;
    if (out.some((x) => x.offer_key === offerKey)) continue;
    out.push({
      country,
      merchant: p.merchant.slice(0, 80),
      merchant_key: key,
      code,
      offer_key: offerKey,
      title: o.title.slice(0, 120),
      amount: o.amount,
      percent_off: o.percent_off,
      currency: o.currency,
      min_spend: o.min_spend,
      ends_on: o.expires_on,
    });
  }
  return out;
}
