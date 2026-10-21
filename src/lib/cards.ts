import { draftToRow, type CardDraft } from '@/domain/cardDraft';
import { friendlyDbError } from './dbErrors';
import { rematchReceipts } from './inbox';
import { supabase } from './supabase';

export async function addUserCards(drafts: CardDraft[]) {
  const { error } = await supabase.from('user_cards').insert(drafts.map(draftToRow));
  if (error) {
    if (error.code === '23505') throw new Error('One of these cards (same card and last 4 digits) is already in your wallet.');
    throw new Error(error.message);
  }
  // Receipts that arrived before the card was added can now be matched to it.
  await rematchReceipts();
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Saves profile settings; falls back to UTC if the device reports a zone Postgres doesn't know. */
export async function updateProfile(userId: string, patch: { is_student?: boolean; onboarded_at?: string; timezone?: string; country?: string | null; home_currency?: string }) {
  let { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select('id');
  if (error?.code === '22023' && patch.timezone) {
    ({ data, error } = await supabase.from('profiles').update({ ...patch, timezone: 'UTC' }).eq('id', userId).select('id'));
  }
  if (error) throw new Error(friendlyDbError('profile', error));
  if (!data?.length) throw new Error(friendlyDbError('profile', { message: 'No profile row', code: 'PGRST116' }));
}
