import { useMemo } from 'react';
import { interestProfile } from '@/domain/deals';
import { shortCardName } from '@/domain/format';
import { perksForYou, type ForYouItem } from '@/domain/forYou';
import { learnTaste } from '@/domain/taste';
import { track } from './analytics';
import { useData } from './data';
import { supabase } from './supabase';

/** Perks the user has access to beyond their inbox, ranked for them. */
export function usePerksForYou(): ForYouItem[] {
  const { data } = useData();
  return useMemo(() => {
    const picked = data.profile?.interests ?? [];
    const profile = interestProfile({ picked, receipts: data.receipts, opportunities: data.opportunities, senderDomains: data.senderDomains });
    const taste = learnTaste({ dealFeedback: data.dealFeedback, deals: data.deals, opportunities: data.opportunities, perkFeedback: data.perkFeedback, programs: data.programs });
    const cardById = new Map(data.cards.map((c) => [c.id, c]));
    const held = data.userCards.map((uc) => ({ uc, card: cardById.get(uc.card_id) })).filter((x) => !!x.card);
    return perksForYou({
      programs: data.programs,
      ownPerks: held.flatMap(({ uc, card }) =>
        data.benefits
          .filter((b) => b.card_id === uc.card_id)
          .map((benefit) => ({ benefit, by: shortCardName(card!.product_name), userCardId: uc.id })),
      ),
      country: data.profile?.country ?? null,
      isStudent: !!data.profile?.is_student,
      picked,
      // What you've shown you like (saved, used, "I have it") first, then what you spend on.
      inferred: [...new Set([...taste.liked.map(([i]) => i), ...[...profile.inferred].sort((a, b) => b[1] - a[1]).map(([i]) => i)])].filter(
        (i) => !taste.disliked.some(([d]) => d === i),
      ),
      shops: profile.shops,
      follows: profile.follows,
      issuers: [...new Set(held.filter((x) => x.card!.kind !== 'membership').map((x) => x.card!.issuer))],
      feedback: new Map(data.perkFeedback.map((f) => [f.program_id, f.action])),
    });
  }, [data]);
}

/** "I have it" / "Not for me": the perk stops being suggested. */
export async function sendPerkFeedback(programId: string, action: 'have' | 'dismissed', group: ForYouItem['group']) {
  const { error } = await supabase.from('perk_feedback').upsert({ program_id: programId, action }, { onConflict: 'user_id,program_id' });
  if (error) throw new Error(error.message);
  track('perk_for_you', { action, group });
}

/** Bring back every perk the user answered (only their own rows are visible to delete). */
export async function clearPerkFeedback() {
  const { error } = await supabase.from('perk_feedback').delete().neq('program_id', '');
  if (error) throw new Error(error.message);
  track('perk_for_you', { action: 'undo' });
}
