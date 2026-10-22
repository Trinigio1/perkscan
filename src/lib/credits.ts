import { track } from './analytics';
import { supabase } from './supabase';

/** See public.mark_credit_used for the meaning of each combination. */
export async function markCredit(opportunityId: string, isUsed: boolean, amountUsed: number | null = null) {
  const { error } = await supabase.rpc('mark_credit_used', {
    p_opportunity_id: opportunityId,
    p_is_used: isUsed,
    p_amount_used: amountUsed,
  });
  if (error) throw new Error(error.message);
  if (isUsed || (amountUsed ?? 0) > 0) track('credit_marked_used', { partial: !isUsed });
}
