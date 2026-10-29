import { useMemo } from 'react';
import { paidFor, type PaidFor, type ReceiptWithDiscounts, type SetupAnswer } from '@/domain/paidFor';
import { track } from './analytics';
import { useData } from './data';
import { supabase } from './supabase';

/** Each card and membership you pay for, against what it gave back this year, and perks to turn on. */
export function usePaidFor(): PaidFor[] {
  const { data } = useData();
  return useMemo(() => {
    // Recent receipts (for what memberships charge) and this year's receipts with savings lines, once each.
    const withLines = new Map(data.discountReceipts.map((r) => [r.id, r]));
    const receipts: ReceiptWithDiscounts[] = [
      ...data.receipts.map((r) => ({ ...r, discounts: withLines.get(r.id)?.discounts ?? [] })),
      ...data.discountReceipts.filter((r) => !data.receipts.some((x) => x.id === r.id)),
    ];
    return paidFor(
      {
        userCards: data.userCards,
        cards: data.cards,
        benefits: data.benefits,
        opportunities: data.opportunities,
        recovered: data.recovered,
        receipts,
        setup: data.perkSetup,
        isStudent: !!data.profile?.is_student,
      },
      new Date(),
    );
  }, [data]);
}

/** "Done" or "Not for me" on a perk to turn on. */
export async function answerSetup(userCardId: string, benefitId: string, status: SetupAnswer) {
  const { error } = await supabase
    .from('perk_setup')
    .upsert({ user_card_id: userCardId, benefit_id: benefitId, status, updated_at: new Date().toISOString() }, { onConflict: 'user_id,user_card_id,benefit_id' });
  if (error) throw new Error(error.message);
  track('perk_setup', { action: status });
}

/** Undo an answer: the perk shows up to turn on again. */
export async function clearSetup(userCardId: string, benefitId: string) {
  const { error } = await supabase.from('perk_setup').delete().eq('user_card_id', userCardId).eq('benefit_id', benefitId);
  if (error) throw new Error(error.message);
  track('perk_setup', { action: 'undo' });
}
