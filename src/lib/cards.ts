import { draftToRow, type CardDraft } from '@/domain/cardDraft';
import { supabase } from './supabase';

export async function addUserCards(drafts: CardDraft[]) {
  const { error } = await supabase.from('user_cards').insert(drafts.map(draftToRow));
  if (error) {
    if (error.code === '23505') throw new Error('One of these cards (same card and last 4 digits) is already in your wallet.');
    throw new Error(error.message);
  }
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Saves profile settings; falls back to UTC if the device reports a zone Postgres doesn't know. */
export async function updateProfile(userId: string, patch: { is_student?: boolean; onboarded_at?: string; timezone?: string }) {
  let { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error?.code === '22023' && patch.timezone) {
    ({ error } = await supabase.from('profiles').update({ ...patch, timezone: 'UTC' }).eq('id', userId));
  }
  if (error) throw new Error(error.message);
}
