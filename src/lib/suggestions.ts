import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Suggestions the user dismissed, remembered on this device.
const KEY = 'perkscan.dismissedSuggestions';

export function useDismissed(): [Set<string>, (id: string) => void] {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setDismissed(new Set(v ? (JSON.parse(v) as string[]) : [])))
      .catch(() => {});
  }, []);
  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      AsyncStorage.setItem(KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);
  return [dismissed, dismiss];
}
