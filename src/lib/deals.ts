import { useMemo } from 'react';
import { interestProfile, peopleLikeYou, rankDeals, suggestedInterests, type DealFeedback, type Interest, type InterestProfile, type RankedDeal } from '@/domain/deals';
import { track } from './analytics';
import { useData } from './data';
import { supabase } from './supabase';

/** Save a deal (it becomes an item in Money), hide it, or say it didn't work. */
export async function sendDealFeedback(dealId: string, action: DealFeedback['action']): Promise<string | null> {
  const { data, error } = await supabase.rpc('deal_feedback', { p_deal: dealId, p_action: action });
  if (error) throw new Error(error.code === 'P0002' ? 'That deal has ended' : error.message);
  track('deal_feedback', { action });
  return (data as string | null) ?? null;
}

/** Deals for the signed-in user, ranked by how well they match. */
export function useDeals(): { forYou: RankedDeal[]; popular: RankedDeal[]; profile: InterestProfile; suggested: Interest[]; picked: string[] } {
  const { data } = useData();
  return useMemo(() => {
    const picked = data.profile?.interests ?? [];
    const profile = interestProfile({ picked, receipts: data.receipts, opportunities: data.opportunities, senderDomains: data.senderDomains });
    const ranked = rankDeals(data.deals, {
      country: data.profile?.country ?? null,
      region: data.profile?.region ?? null,
      today: new Date().toISOString().slice(0, 10),
      profile,
      feedback: data.dealFeedback,
      likeYou: peopleLikeYou(profile, data.storeStats, data.storePairs),
    });
    return { ...ranked, profile, suggested: suggestedInterests(profile), picked };
  }, [data]);
}
