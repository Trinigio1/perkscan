/** Form state and validation for adding/editing a card in the wallet. */
export interface CardDraft {
  card_id: string;
  last_four: string;
  open_date: string;
  nickname: string;
}

export const emptyDraft = (card_id: string): CardDraft => ({ card_id, last_four: '', open_date: '', nickname: '' });

/** Returns an error message per field, or an empty object when the draft is valid. */
export function validateDraft(d: CardDraft): Partial<Record<keyof CardDraft, string>> {
  const errors: Partial<Record<keyof CardDraft, string>> = {};
  if (!/^\d{4}$/.test(d.last_four)) errors.last_four = 'Enter exactly the last 4 digits.';
  if (d.open_date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.open_date);
    const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    if (!m || !date || date.getMonth() !== Number(m[2]) - 1 || date.getDate() !== Number(m[3])) {
      errors.open_date = 'Use YYYY-MM-DD, e.g. 2023-04-15.';
    } else if (date.getTime() > Date.now()) {
      errors.open_date = 'Open date can’t be in the future.';
    }
  }
  if (d.nickname.length > 60) errors.nickname = 'Keep it under 60 characters.';
  return errors;
}

export function draftToRow(d: CardDraft) {
  return {
    card_id: d.card_id,
    last_four: d.last_four,
    open_date: d.open_date || null,
    nickname: d.nickname.trim() || null,
  };
}
