import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { suggestions, type Suggestion } from '@/domain/suggestions';
import { useData } from './data';

// Suggestions the user dismissed, remembered on this device.
const KEY = 'perkscan.dismissedSuggestions';

/** What the user hid on this device, a way to hide more, and whether the list has loaded yet. */
export function useDismissed(): [Set<string>, (id: string) => void, boolean] {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setDismissed(new Set(v ? (JSON.parse(v) as string[]) : [])))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      AsyncStorage.setItem(KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);
  return [dismissed, dismiss, loaded];
}

/** "For you" suggestions for the signed-in user, minus the ones they hid. */
export function useSuggestions(): { list: Suggestion[]; hide: (id: string) => void } {
  const { data } = useData();
  const [dismissed, dismiss] = useDismissed();
  const all = useMemo(
    () =>
      suggestions({
        country: data.profile?.country ?? null,
        isStudent: !!data.profile?.is_student,
        school: data.school,
        schoolHints: data.schoolHints,
        studentOffers: data.studentOffers,
        studentClaims: data.studentClaims,
        programs: data.programs,
        opportunities: data.opportunities,
        receipts: data.receipts,
        senderDomains: data.senderDomains,
        userCards: data.userCards,
        cards: data.cards,
        benefits: data.benefits,
      }),
    [data],
  );
  return { list: all.filter((s) => !dismissed.has(s.id)), hide: dismiss };
}
