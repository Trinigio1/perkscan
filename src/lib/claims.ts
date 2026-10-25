import type { ClaimKind } from '@/domain/claims';
import { track } from './analytics';
import { supabase } from './supabase';

// The user sends the request themselves; PerkScan only remembers that they did, and checks in later.

/** How the claim was started: opened the store, sent PerkScan's draft, filled a form… */
export type ClaimMethod = 'copy_and_open' | 'open' | 'copy' | 'email_draft' | 'copy_message' | 'form' | 'details';

export async function startClaim(opportunityId: string, kind: ClaimKind | 'use', method: ClaimMethod) {
  const { error } = await supabase.rpc('start_claim', { p_opportunity_id: opportunityId });
  if (error) throw new Error(error.message);
  track('claim_started', { kind, method });
}

/** "Not yet": ask again in a few days. */
export async function snoozeClaimCheck(opportunityId: string) {
  const { error } = await supabase.rpc('snooze_claim_check', { p_opportunity_id: opportunityId });
  if (error) throw new Error(error.message);
  track('claim_checked', { result: 'not_yet' });
}

/** "Didn't use it": stop asking, keep the item. */
export async function cancelClaim(opportunityId: string) {
  const { error } = await supabase.rpc('cancel_claim', { p_opportunity_id: opportunityId });
  if (error) throw new Error(error.message);
  track('claim_checked', { result: 'didnt_work' });
}
