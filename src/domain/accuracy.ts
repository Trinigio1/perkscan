// Reading accuracy, from the user's own reviews of what PerkScan read.

export type WrongField = 'kind' | 'merchant' | 'amount' | 'currency' | 'code' | 'expiry' | 'card' | 'date' | 'missed' | 'not_real' | 'other';

export const WRONG_FIELD_LABELS: Record<WrongField, string> = {
  kind: 'Wrong type of message',
  merchant: 'Store name',
  amount: 'Amount',
  currency: 'Currency',
  code: 'Code',
  expiry: 'Expiry date',
  card: 'Card digits',
  date: 'Purchase date',
  missed: 'Missed something',
  not_real: 'Not a real offer',
  other: 'Something else',
};

export interface Accuracy {
  read: number;
  checked: number;
  right: number;
  wrong: number;
  fields: Partial<Record<WrongField, number>>;
  by_version: { version: string; checked: number; right: number }[];
}

/** Below this many reviews a percentage says more about luck than the reader. */
export const MIN_REVIEWS_FOR_RATE = 10;

/** Share of reviewed messages read correctly, 0-100, or null with nothing reviewed. */
export function accuracyPercent(a: Pick<Accuracy, 'checked' | 'right'>): number | null {
  return a.checked > 0 ? Math.round((a.right / a.checked) * 100) : null;
}

/** Most common mistakes first, e.g. [{ field: 'expiry', label: 'Expiry date', count: 3 }]. */
export function topMistakes(a: Pick<Accuracy, 'fields'>, limit = 3): { field: WrongField; label: string; count: number }[] {
  return (Object.entries(a.fields) as [WrongField, number][])
    .filter(([f, n]) => n > 0 && f in WRONG_FIELD_LABELS)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, limit)
    .map(([field, count]) => ({ field, label: WRONG_FIELD_LABELS[field], count }));
}

/** "Check 7 more to see a reliable rate" style hint, or null once there are enough. */
export function reviewsNeeded(a: Pick<Accuracy, 'checked'>): number | null {
  return a.checked >= MIN_REVIEWS_FOR_RATE ? null : MIN_REVIEWS_FOR_RATE - a.checked;
}
