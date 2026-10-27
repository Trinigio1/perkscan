import { storeKey } from './deals';
import { offerInterests } from './interests';
import { isMutedStore, muteKeyOf } from './mutes';
import type { Card, Opportunity, Receipt, UserCard } from './types';

// What's worth your attention, in order: offers at stores you actually buy from first, then ones that
// match what you're into, then the rest. Old codes with no end date retire on their own, and one store's
// pile of codes shows as one row. Pure, so every rule is tested.

const DAY = 86_400_000;

/** A code with no end date is treated as over this long after its email was sent. */
export const STALE_DAYS = 30;

/** When the offer was seen: the email's sent date, else when it was saved. */
export const seenOn = (o: Pick<Opportunity, 'sent_on' | 'created_at'>): string => o.sent_on ?? o.created_at;

/**
 * An emailed code with no end date from more than STALE_DAYS ago ("VALENTINE10" from February): almost
 * certainly over. It's left out quietly, never counted as missed. Gift cards, store credit, card credits,
 * anything added by hand or already acted on stay.
 */
export function isStale(o: Opportunity, now: Date): boolean {
  if (o.type !== 'promo' || o.expires_at || o.status !== 'open' || o.claim_started_at) return false;
  if (o.dedupe_key?.startsWith('manual:')) return false;
  return now.getTime() - new Date(seenOn(o)).getTime() > STALE_DAYS * DAY;
}

export interface YourStores {
  /** Stores on your receipts and the memberships you've added ("uber", "amazon"). */
  stores: string[];
  /** The interests you picked. */
  interests: string[];
}

/** Your stores: from receipts (not bank alerts' odd names alone) and from memberships you've added. */
export function yourStores(
  receipts: Pick<Receipt, 'merchant'>[],
  userCards: Pick<UserCard, 'card_id'>[],
  cards: Pick<Card, 'id' | 'kind' | 'issuer'>[],
  interests: string[] = [],
): YourStores {
  const keys = new Set<string>();
  for (const r of receipts) {
    const k = storeKey(r.merchant);
    if (k.length >= 3) keys.add(k);
  }
  for (const u of userCards) {
    const card = cards.find((c) => c.id === u.card_id);
    if (card?.kind === 'membership') {
      const k = storeKey(card.issuer);
      if (k.length >= 3) keys.add(k);
    }
  }
  return { stores: [...keys], interests };
}

/** The store an offer belongs to: its email's domain ("email.uber.com" -> "uber"), else its name. */
export const storeOf = (o: Pick<Opportunity, 'merchant' | 'sender_domain'>): string | null => muteKeyOf(o);

/** 0: yours (a store you buy from, a membership, or one of your cards). 1: matches your interests. 2: the rest. */
export function relevance(o: Opportunity, you: YourStores): 0 | 1 | 2 {
  if (o.user_card_id || o.dedupe_key?.startsWith('manual:')) return 0;
  const keys = [storeOf(o), o.merchant ? storeKey(o.merchant) : null];
  if (keys.some((k) => isMutedStore(k, you.stores))) return 0;
  if (you.interests.length && offerInterests(o).some((i) => you.interests.includes(i))) return 1;
  return 2;
}

/**
 * A vague offer from a store you don't use and that isn't one of your interests ("Factors.ai: save 25%",
 * no code, no amount): nothing to act on and nothing to gain, so it isn't shown. The same offer from a
 * store you buy from stays, as something to check.
 */
export function isVagueElsewhere(o: Opportunity, you: YourStores): boolean {
  if (o.type !== 'promo' || o.status !== 'open' || o.claim_started_at || o.dedupe_key?.startsWith('manual:') || o.dedupe_key?.startsWith('deal:')) return false;
  if (o.value_estimate !== null || o.code || o.discount_amount) return false;
  return relevance(o, you) === 2;
}

/** Codes from one store, best first: the first one shows, the others fold under it. */
export interface StoreGroup {
  lead: Opportunity;
  more: Opportunity[];
}

/**
 * One row per store for codes ("Funded Trading Plus · 18 codes"). Items keep their order; a store's codes
 * collect under its first (best-ranked) one. Card credits, gift cards and the rest are never folded.
 */
export function groupByStore(items: Opportunity[]): StoreGroup[] {
  const out: StoreGroup[] = [];
  const keyed: { key: string; group: StoreGroup }[] = [];
  for (const o of items) {
    // By the store's name ("SAVA" and "Sava Amsterdam" are one store): one sender can email codes for
    // several stores. The email's domain only when there's no name.
    const key = o.type === 'promo' && !o.user_card_id ? (o.merchant ? storeKey(o.merchant) || null : storeOf(o)) : null;
    const g = key ? keyed.find((k) => isMutedStore(key, [k.key]))?.group : undefined;
    if (g) {
      g.more.push(o);
      continue;
    }
    const fresh = { lead: o, more: [] };
    out.push(fresh);
    if (key) keyed.push({ key, group: fresh });
  }
  return out;
}
