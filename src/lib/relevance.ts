import { useCallback, useMemo } from 'react';
import { relevance, yourStores, type YourStores } from '@/domain/relevance';
import type { Opportunity } from '@/domain/types';
import { useData } from './data';

/** The stores you buy from, your memberships and interests, and how relevant an offer is to you. */
export function useRelevance(): { you: YourStores; relevanceOf: (o: Opportunity) => number } {
  const { data } = useData();
  const you = useMemo(
    () => yourStores(data.receipts, data.userCards, data.cards, data.profile?.interests ?? []),
    [data.receipts, data.userCards, data.cards, data.profile?.interests],
  );
  const relevanceOf = useCallback((o: Opportunity) => relevance(o, you), [you]);
  return { you, relevanceOf };
}
