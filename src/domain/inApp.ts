import type { Opportunity } from './types';

/**
 * An in-app deal the reader saw in an email ("Buy 1, get 1 free at Shake Shack"): no code, no
 * stated end, never money. Its expires_at is only when PerkScan stops showing it, so it's never
 * "expiring", "at risk" or "missed", and never reminded about.
 */
export const isInAppDeal = (o: Pick<Opportunity, 'dedupe_key'>) => !!o.dedupe_key?.startsWith('inapp:');
