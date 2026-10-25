import type { ClaimKind } from '@/domain/claims';
import { track } from './analytics';
import { supabase } from './supabase';

// The user sends the request themselves; PerkScan only remembers that they did, and checks in later.

export async function startClaim(opportunityId: string, kind: ClaimKind) {
  const { error } = await supabase.rpc('start_claim', { p_opportunity_id: opportunityId });
  if (error) throw new Error(error.message);
  track('claim_started', { kind });
}

/** "Not yet": ask again in a few days. */
export async function snoozeClaimCheck(opportunityId: string) {
  const { error } = await supabase.rpc('snooze_claim_check', { p_opportunity_id: opportunityId });
  if (error) throw new Error(error.message);
  track('claim_checked', { result: 'not_yet' });
}
