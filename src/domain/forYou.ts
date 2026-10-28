import { interestLabel, matchStore, storeKey } from './deals';
import type { Program } from './programs';
import type { CardBenefit } from './types';

// "Perks for you": everything the user has access to beyond their inbox, ranked for them.
//  - Perks that come with what they already have: their cards' and memberships' perks, and
//    issuer perks (Bank of America's Museums on Us, Amex Offers) for the banks they hold cards from.
//  - Free things to claim: loyalty and birthday rewards at stores they actually use, library perks,
//    free national programs.
// Ranked by how strong the reason is (a store you shop at, a card you hold) over a mere interest,
// then by interest, then by how broadly useful it is. Every item says why. Pure, so every rule is tested.

export interface ForYouInput {
  programs: Program[];
  /** The user's own card and membership perks (type 'perk'), with a label like "Amex Gold". */
  ownPerks: { benefit: Pick<CardBenefit, 'id' | 'name' | 'terms_summary' | 'source_url' | 'status' | 'type'>; by: string; userCardId?: string }[];
  country: string | null;
  isStudent: boolean;
  /** Interests the user picked. */
  picked: string[];
  /** Interests their receipts show, strongest first. */
  inferred: string[];
  /** Store keys they buy from, and ones that email them (from storeProfile). */
  shops: Set<string>;
  follows: Set<string>;
  /** Issuers of the cards they hold, e.g. "Chase", "Bank of America". */
  issuers: string[];
  /** program id -> "have" or "dismissed". */
  feedback: Map<string, 'have' | 'dismissed'>;
}

export type ForYouGroup = 'yours' | 'claim';

export interface ForYouItem {
  key: string;
  group: ForYouGroup;
  title: string;
  /** Who provides it, or which card/membership of yours it comes with. */
  from: string;
  summary: string;
  url: string | null;
  /** One or two short reasons: "You shop at Sephora", "You’re into beauty". */
  why: string[];
  score: number;
  programId: string | null;
  /** For your own perks: the card or membership it comes with. */
  userCardId: string | null;
  /** What it is, for its icon: a catalog kind, or a perk of a card or membership you have. */
  kind: Program['kind'] | 'card_perk';
  /** The interest it's most about, if any. */
  interest: string | null;
}

const issuerWords = (s: string) => {
  const w = s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return w.length === 1 && w[0] === 'amex' ? ['american', 'express'] : w;
};
/** A program's issuer ("Citi") matches a card's ("Citi") by whole words, so "Citi" isn't "First Citizens". */
const issuerMatches = (program: string, card: string) => {
  const need = issuerWords(program);
  const have = new Set(issuerWords(card));
  return need.length > 0 && need.every((w) => have.has(w));
};

/** Which interests one of your own perks speaks to, from its name. */
const PERK_INTERESTS: [RegExp, string][] = [
  [/lounge|global entry|precheck|clear|trip|baggage|bag\b|rental|hotel|travel|airline|flight|status|free night|companion|elite|club pass/i, 'travel'],
  [/resy|dining|restaurant|grubhub|dunkin|chipotle|panera/i, 'dining'],
  [/doordash|dashpass|delivery|instacart|uber eats|uber one/i, 'delivery'],
  [/stream|netflix|hulu|disney|peacock|paramount|prime video|music|gaming|stubhub|apple tv|movie|tuesdays/i, 'entertainment'],
  [/fuel|gallon|\bgas\b/i, 'fuel'],
  [/grocer|whole foods|supermarket/i, 'groceries'],
  [/phone|warranty|purchase protection|return/i, 'electronics'],
  [/peloton|equinox|fitness/i, 'fitness'],
  [/shipping|same-day|walmart|target|costco|sam'?s/i, 'shopping'],
];
export function perkInterests(name: string): string[] {
  return [...new Set(PERK_INTERESTS.filter(([re]) => re.test(name)).map(([, i]) => i))];
}

// How broadly useful a perk is with no personal reason at all.
const BASE: Partial<Record<Program['kind'], number>> = { free_perk: 8, unclaimed: 9, library: 6, loyalty: 4, price_adjust: 3 };
// Refund and deadline rules are about something that already happened; the reader applies those.
const SHOWN_KINDS = new Set<Program['kind']>(['free_perk', 'library', 'loyalty', 'unclaimed', 'price_adjust']);

export function perksForYou(d: ForYouInput): ForYouItem[] {
  const items: ForYouItem[] = [];
  const known = d.picked.length + d.inferred.length > 0;
  // "Everything else" is too broad to be a reason.
  const interestWhy = (all: string[]): { points: number; why: string | null; id: string | null } => {
    const ids = all.filter((i) => i !== 'shopping');
    const picked = ids.find((i) => d.picked.includes(i));
    if (picked) return { points: 20, why: `You’re into ${interestLabel(picked).toLowerCase()}`, id: picked };
    const spent = ids.find((i) => d.inferred.includes(i));
    if (spent) return { points: 12, why: `You spend on ${interestLabel(spent).toLowerCase()}`, id: spent };
    return { points: 0, why: null, id: null };
  };

  for (const p of d.programs) {
    if (p.status !== 'active' || !SHOWN_KINDS.has(p.kind)) continue;
    if (d.feedback.has(p.id)) continue;
    if (d.country && p.countries.length && !p.countries.includes(d.country)) continue;
    if (p.student_only && !d.isStudent) continue;
    const issuer = p.issuers.length ? p.issuers.find((x) => d.issuers.some((i) => issuerMatches(x, i))) : null;
    if (p.issuers.length && !issuer) continue;

    let score = BASE[p.kind] ?? 0;
    const why: string[] = [];
    const store = { merchant: p.provider, merchant_keys: p.merchants.map(storeKey) };
    if (p.merchants.length && matchStore(store, d.shops)) {
      score += 40;
      why.push(`You shop at ${p.provider}`);
    } else if (p.merchants.length && matchStore(store, d.follows)) {
      score += 30;
      why.push(`${p.provider} emails you`);
    }
    if (issuer) {
      score += 40;
      why.push(`You have ${/^[aeiou]/i.test(issuer) ? 'an' : 'a'} ${issuer} card`);
    }
    if (p.student_only) {
      score += 25;
      why.push('You’re a student');
    }
    const interest = interestWhy(p.interests);
    if (interest.why) {
      score += interest.points;
      why.push(interest.why);
    }
    // Store programs and interest-only perks need a personal reason; general ones (taxes, unclaimed
    // money) don't. With no interests known yet, interest-only perks show at their base score.
    const personal = why.length > 0;
    const general = !p.merchants.length && !p.issuers.length && (!p.interests.length || !known);
    if (!personal && !general) continue;
    items.push({
      key: `program:${p.id}`,
      group: issuer || p.student_only ? 'yours' : 'claim',
      title: p.name,
      from: p.provider,
      summary: p.summary,
      url: p.url,
      why: why.slice(0, 2),
      score,
      programId: p.id,
      userCardId: null,
      kind: p.kind,
      interest: interest.id ?? p.interests[0] ?? null,
    });
  }

  // Your own card and membership perks that match what you're into. Until PerkScan knows what
  // you're into, all of them, below anything with a stronger reason.
  for (const { benefit: b, by, userCardId } of d.ownPerks) {
    if (b.type !== 'perk' || b.status !== 'active') continue;
    const interest = interestWhy(perkInterests(b.name));
    if (known && !interest.why) continue;
    items.push({
      key: `benefit:${b.id}:${by}`,
      group: 'yours',
      title: b.name,
      from: by,
      summary: b.terms_summary ?? '',
      url: b.source_url,
      why: interest.why ? [`Comes with your ${by}`, interest.why] : [`Comes with your ${by}`],
      score: (interest.why ? 25 : 10) + interest.points,
      programId: null,
      userCardId: userCardId ?? null,
      kind: 'card_perk',
      interest: interest.id ?? perkInterests(b.name)[0] ?? null,
    });
  }

  return items.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
