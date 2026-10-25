import { useMemo } from 'react';
import { membershipHints, payingTwice, recentCharges, type MembershipHint, type PayingTwice } from '@/domain/subscriptions';
import { useData, useLookups } from './data';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Memberships the user's receipts show they pay for but haven't added. */
export function useMembershipHints(): MembershipHint[] {
  const { data } = useData();
  return useMemo(() => membershipHints(recentCharges(data.receipts, daysAgo(365)), data.userCards, data.cards), [data.receipts, data.userCards, data.cards]);
}

/** Subscriptions charged in the last ~6 weeks that a membership or card the user has already covers. */
export function usePayingTwice(): PayingTwice[] {
  const { data } = useData();
  const { userCardLabel } = useLookups();
  return useMemo(
    () => payingTwice(recentCharges(data.receipts, daysAgo(45)), data.userCards, data.benefits, userCardLabel),
    [data.receipts, data.userCards, data.benefits, userCardLabel],
  );
}
