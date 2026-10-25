import { useMemo } from 'react';
import { storeOffers, storeProfile, type DealFeedback, type RankedDeal } from '@/domain/deals';
import { track } from './analytics';
import { useData } from './data';
import { supabase } from './supabase';

/** Save an offer (it becomes an item in Activity), hide it, or say it didn't work. */
export async function sendDealFeedback(dealId: string, action: DealFeedback['action']): Promise<string | null> {
  const { data, error } = await supabase.rpc('deal_feedback', { p_deal: dealId, p_action: action });
  if (error) throw new Error(error.code === 'P0002' ? 'That deal has ended' : error.message);
  track('deal_feedback', { action });
  return (data as string | null) ?? null;
}

/** Offers on the official pages of stores the signed-in user already shops at or hears from. */
export function useStoreOffers(): RankedDeal[] {
  const { data } = useData();
  return useMemo(
    () =>
      storeOffers(data.deals, {
        country: data.profile?.country ?? null,
        region: data.profile?.region ?? null,
        today: new Date().toISOString().slice(0, 10),
        stores: storeProfile({ receipts: data.receipts, opportunities: data.opportunities, senderDomains: data.senderDomains }),
        feedback: data.dealFeedback,
      }),
    [data],
  );
}
