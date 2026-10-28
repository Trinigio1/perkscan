import { storeKey } from './deals';
import type { Opportunity } from './types';

// Where a code works. Delivery apps and marketplaces often limit a code to some restaurants or stores, or to
// a first order; the reader records what the email says. When a delivery app's email doesn't say, that's
// said too, so nobody finds out at checkout. Pure, so tested.

/** Apps where a code usually applies only at some restaurants or stores. */
const MARKETPLACES = ['ubereats', 'uber', 'doordash', 'grubhub', 'instacart', 'postmates', 'seamless', 'gopuff'];

export interface WhereItWorks {
  /** "Only at ALDI · first order only" — shown on the row and the offer's page. */
  line: string | null;
  /** When a delivery app's email doesn't say where: a heads-up for the offer's page. */
  caveat: string | null;
}

export function whereItWorks(o: Pick<Opportunity, 'type' | 'merchant' | 'valid_at' | 'first_order_only'>): WhereItWorks {
  if (o.type !== 'promo') return { line: null, caveat: null };
  const where = o.valid_at?.trim() || null;
  const parts = [where ? (/^participating|^select|^some /i.test(where) ? `${where[0]!.toUpperCase()}${where.slice(1)} only` : `Only at ${where}`) : null, o.first_order_only ? 'first order only' : null].filter(
    (x): x is string => !!x,
  );
  const line = parts.length ? parts.map((p, i) => (i === 0 ? p[0]!.toUpperCase() + p.slice(1) : p)).join(' · ') : null;
  const key = o.merchant ? storeKey(o.merchant) : '';
  const marketplace = MARKETPLACES.some((m) => key === m || key.startsWith(m));
  const caveat =
    !where && marketplace
      ? `The email doesn’t say which ${/instacart|gopuff/.test(key) ? 'stores' : 'restaurants'} this works at. ${o.merchant} codes often apply only at some, so check the offer’s terms in the app before you order.`
      : null;
  return { line, caveat };
}
