import type { Card, UserCard } from './types';

// "Is this your card?": cards the user's own email shows they hold (statements, payment notices,
// bank alerts) but that aren't in PerkScan yet. Each one added unlocks its credits and protections.
// Matched to the catalog only when the card's name leaves one clear answer. Pure, so every rule is tested.

export interface CardSighting {
  id: string;
  issuer: string;
  /** The card's name as the email wrote it, or '' if not named. */
  product: string;
  /** Last 4 digits, or '' if not shown. */
  last_four: string;
  times_seen: number;
  last_seen: string;
}

export interface SpottedCard {
  key: string;
  issuer: string;
  lastFour: string | null;
  /** The name as the email wrote it, if it did. */
  product: string | null;
  /** The catalog card it is, when the name leaves one clear answer. */
  card: Card | null;
  /** The issuer's cards in the catalog, to pick from when it isn't clear. */
  candidates: Card[];
  sightingIds: string[];
  timesSeen: number;
}

/** "American Express", "Scotiabank Trinidad & Tobago" -> letters only, for comparing issuers. */
const issuerKey = (s: string) => {
  const k = s.toLowerCase().replace(/[^a-z]/g, '');
  return k === 'amex' ? 'americanexpress' : k;
};
const sameIssuer = (catalog: string, seen: string) => {
  const a = issuerKey(catalog);
  const b = issuerKey(seen);
  return !!a && !!b && (a.startsWith(b) || b.startsWith(a));
};

/** Words that don't tell cards apart. */
const FILLER = new Set(['the', 'card', 'credit', 'from', 'by', 'visa', 'mastercard', 'signature', 'infinite', 'world', 'elite', 'rewards', 'reward', 'cash', 'back']);
function words(name: string, issuer: string): string[] {
  const drop = new Set([...FILLER, ...issuer.toLowerCase().split(/[^a-z0-9]+/), 'american', 'express', 'amex', 'chase', 'citi', 'capital', 'one']);
  return name
    .toLowerCase()
    .replace(/[®™℠]/g, '')
    .split(/[^a-z0-9+]+/)
    .filter((w) => w && !drop.has(w));
}

/**
 * The catalog card a name points to: every word of the name must be in the card's name. When
 * several fit, the one with the fewest other words wins ("Platinum Card" is the Platinum Card, not
 * the Delta Platinum), but only if it's the only one that short; otherwise there's no clear answer.
 */
export function matchCatalogCard(product: string, issuer: string, catalog: Card[]): Card | null {
  const mine = words(product, issuer);
  if (!mine.length) return null;
  const fits = catalog
    .filter((c) => sameIssuer(c.issuer, issuer))
    .map((c) => ({ c, w: words(c.product_name, c.issuer) }))
    .filter((x) => mine.every((m) => x.w.includes(m)))
    .map((x) => ({ c: x.c, extra: x.w.length - mine.length }))
    .sort((a, b) => a.extra - b.extra);
  if (!fits.length) return null;
  if (fits.length > 1 && fits[1]!.extra === fits[0]!.extra) return null;
  return fits[0]!.c;
}

/**
 * Cards seen in email that the user hasn't added: grouped by issuer and last 4 digits (or by name
 * when no digits were shown), most often seen first. A card is left out once a card from that
 * issuer with those digits is added, or — for a name with no digits — once that card is added.
 */
export function spottedCards(sightings: CardSighting[], userCards: Pick<UserCard, 'card_id' | 'last_four'>[], catalog: Card[]): SpottedCard[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const owned = userCards.map((u) => ({ card: byId.get(u.card_id), lastFour: u.last_four }));
  const groups = new Map<string, SpottedCard>();

  // With digits first, so a named sighting can join the card it belongs to.
  const sorted = [...sightings].sort((a, b) => Number(!!b.last_four) - Number(!!a.last_four));
  for (const s of sorted) {
    const issuerCards = catalog.filter((c) => sameIssuer(c.issuer, s.issuer));
    const named = s.product ? matchCatalogCard(s.product, s.issuer, catalog) : null;
    let key = s.last_four ? `${issuerKey(s.issuer)}|${s.last_four}` : `${issuerKey(s.issuer)}|${named?.id ?? s.product.toLowerCase()}`;
    if (!s.last_four && named) {
      // "Your Freedom Unlimited benefits" without digits: same card as a sighting with digits?
      const withDigits = [...groups.values()].find((g) => g.card?.id === named.id && g.lastFour);
      if (withDigits) key = withDigits.key;
    }
    const g = groups.get(key) ?? {
      key, issuer: s.issuer, lastFour: s.last_four || null, product: null, card: null, candidates: issuerCards, sightingIds: [], timesSeen: 0,
    };
    g.sightingIds.push(s.id);
    g.timesSeen += s.times_seen;
    if (s.product && !g.product) g.product = s.product;
    if (named && !g.card) g.card = named;
    groups.set(key, g);
  }

  return [...groups.values()]
    .filter((g) => {
      if (g.lastFour) return !owned.some((o) => o.lastFour === g.lastFour && (!o.card || sameIssuer(o.card.issuer, g.issuer)));
      return !g.card || !owned.some((o) => o.card?.id === g.card!.id);
    })
    .sort((a, b) => b.timesSeen - a.timesSeen);
}

/** "Chase Freedom Unlimited ·· 4821", "a Chase card ending 4821", "an American Express card ending 1007". */
export function spottedLabel(s: SpottedCard): string {
  const digits = s.lastFour ? ` ·· ${s.lastFour}` : '';
  if (s.card) return `${s.card.product_name.replace(/[®™℠]/g, '')}${digits}`;
  if (s.product) return `${s.issuer} ${s.product}${digits}`;
  return `${/^[aeiou]/i.test(s.issuer) ? 'an' : 'a'} ${s.issuer} card ending ${s.lastFour}`;
}
