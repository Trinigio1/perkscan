import type { ParsedEmail } from './schema.ts';

// Cards the user holds, as their email shows them: statements, payment notices, card alerts and
// benefit emails from the issuer. Only the issuer, the card's name and its last 4 digits — never more.
// Pure, so every rule is tested.

export interface CardSightingRow {
  issuer: string;
  /** The card's name as written ("Freedom Unlimited"), or '' if the email didn't name it. */
  product: string;
  /** The last 4 digits, or '' if not shown. */
  last_four: string;
}

/** Issuer email domains -> the issuer's usual name. Subdomains count (e.g. alerts.chase.com). */
const ISSUER_DOMAINS: [RegExp, string][] = [
  [/(^|\.)chase\.com$/, 'Chase'],
  [/(^|\.)(americanexpress\.com|aexp\.com|amex\.com)$/, 'American Express'],
  [/(^|\.)capitalone\.com$/, 'Capital One'],
  [/(^|\.)(citi\.com|citibank\.com|citicards\.com)$/, 'Citi'],
  [/(^|\.)discover\.com$/, 'Discover'],
  [/(^|\.)wellsfargo\.com$/, 'Wells Fargo'],
  [/(^|\.)(bankofamerica\.com|bofa\.com|ealerts\.bankofamerica\.com)$/, 'Bank of America'],
  [/(^|\.)usbank\.com$/, 'U.S. Bank'],
  [/(^|\.)(barclaycardus\.com|barclays\.com|barclaysus\.com)$/, 'Barclays'],
  [/(^|\.)(synchrony\.com|synchronybank\.com)$/, 'Synchrony'],
  [/(^|\.)(scotiabank\.com|tt\.scotiabank\.com)$/, 'Scotiabank'],
  [/(^|\.)firstcitizenstt\.com$/, 'First Citizens'],
  [/(^|\.)republictt\.com$/, 'Republic Bank'],
];

export function issuerFromDomain(domain: string | null | undefined): string | null {
  const d = (domain ?? '').toLowerCase().trim();
  if (!d) return null;
  return ISSUER_DOMAINS.find(([re]) => re.test(d))?.[1] ?? null;
}

/** "AMEX", "JPMorgan Chase Bank" -> the usual name; anything else is kept as written. */
export function canonicalIssuer(name: string): string {
  const n = name.toLowerCase();
  if (/\bamex\b|american express/.test(n)) return 'American Express';
  if (/\bchase\b/.test(n)) return 'Chase';
  if (/capital ?one/.test(n)) return 'Capital One';
  if (/\bciti(bank)?\b/.test(n)) return 'Citi';
  if (/\bdiscover\b/.test(n)) return 'Discover';
  if (/wells fargo/.test(n)) return 'Wells Fargo';
  if (/bank of america|\bbofa\b/.test(n)) return 'Bank of America';
  if (/apple card|goldman/.test(n)) return 'Apple';
  if (/scotia/.test(n)) return 'Scotiabank';
  if (/first citizens/.test(n)) return 'First Citizens';
  if (/republic bank/.test(n)) return 'Republic Bank';
  return name.trim().slice(0, 60);
}

/**
 * The card an email shows the user holds, if any. The issuer comes from what the email says, or else
 * from a known issuer's domain — a bank alert from chase.com is a Chase card even if it never says so.
 * Emails from anyone else (a store mentioning "your Visa ending 1234") only count when the reader says
 * the email is from the issuer.
 */
export function cardSighting(p: ParsedEmail, fromDomain: string | null): CardSightingRow | null {
  const byDomain = issuerFromDomain(fromDomain);
  const said = p.card ?? null;
  const fromAlert = p.kind === 'card_alert' ? p.receipt?.card_last_four ?? null : null;
  const issuer = said?.issuer ? canonicalIssuer(said.issuer) : fromAlert ? byDomain : null;
  if (!issuer) return null;
  const product = said?.product ?? '';
  const lastFour = said?.last_four ?? fromAlert ?? '';
  if (!product && !lastFour) return null;
  return { issuer, product, last_four: lastFour };
}
