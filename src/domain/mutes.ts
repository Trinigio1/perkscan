import { domainStoreKey, storeKey } from './deals';
import type { Opportunity } from './types';

// "Hide offers from this store": the user's own muted stores. Their offers and deals aren't shown;
// card credits, protections and anything the user added or acted on still are. Pure, so tested.

/** The key a store is hidden by: its email domain ("email.uber.com" -> "uber"), else its name. */
export function muteKeyOf(o: Pick<Opportunity, 'merchant' | 'sender_domain'>): string | null {
  return (o.sender_domain ? domainStoreKey(o.sender_domain) : null) ?? (o.merchant ? storeKey(o.merchant) || null : null);
}

/** Does a store name or key belong to a hidden store? "ubereats" and "uber" are the same store; "uberta" isn't checked below 4 letters. */
export function isMutedStore(key: string | null, mutes: string[]): boolean {
  if (!key) return false;
  return mutes.some((m) => key === m || (m.length >= 4 && key.startsWith(m)) || (key.length >= 4 && m.startsWith(key)));
}

/** Hidden: an offer from a hidden store, unless it's a card credit or protection, added by hand, or already acted on. */
export function isMutedOffer(o: Opportunity, mutes: string[]): boolean {
  if (!mutes.length || o.type === 'card_credit' || o.type === 'protection' || o.status !== 'open' || o.claim_started_at) return false;
  if (o.dedupe_key?.startsWith('manual:')) return false;
  return isMutedStore(muteKeyOf(o), mutes) || isMutedStore(o.merchant ? storeKey(o.merchant) : null, mutes);
}
