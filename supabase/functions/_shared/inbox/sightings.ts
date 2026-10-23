import type { ParsedEmail } from './schema.ts';

// Public promo codes from an email, for people who turned on "Share public codes".
// Only the store, the offer, the code and its dates leave the user's account — never the
// email, its sender address or who received it. A code only becomes visible to others once
// enough different people got the same one (see _promote_shared_deals), so codes made for
// one person (birthday rewards, referral and gift card codes) never show.

export interface Sighting {
  country: string;
  merchant: string;
  merchant_key: string;
  code: string;
  title: string;
  amount: number | null;
  percent_off: number | null;
  currency: string | null;
  min_spend: number | null;
  ends_on: string | null;
}

/** "Courts (Trinidad) Ltd." -> "courtstrinidadltd": how the same store is recognised across people. */
export const merchantKey = (m: string) => m.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);

/** Words that mark a code as made for one person. */
const PERSONAL = /\b(birthday|referr|refer a friend|gift card|your (own|personal|unique)|just for you|exclusive to you|welcome back)\b/i;

export function sightingsFrom(p: ParsedEmail, country: string | null, today: string): Sighting[] {
  if (!country || !/^[A-Z]{2}$/.test(country) || !p.merchant || p.kind !== 'promo') return [];
  const key = merchantKey(p.merchant);
  if (key.length < 2) return [];
  return p.offers
    .filter((o) => o.type === 'promo' && !!o.code && (o.amount !== null || o.percent_off !== null))
    .filter((o) => !o.expires_on || o.expires_on >= today)
    .filter((o) => !PERSONAL.test(`${o.title} ${o.details ?? ''} ${p.summary}`))
    .map((o) => ({
      country,
      merchant: p.merchant!.slice(0, 80),
      merchant_key: key,
      code: o.code!.toUpperCase(),
      title: o.title.slice(0, 120),
      amount: o.amount,
      percent_off: o.percent_off,
      currency: o.currency,
      min_spend: o.min_spend,
      ends_on: o.expires_on,
    }));
}
