import { draftToRow, type CardDraft } from '@/domain/cardDraft';
import { track } from './analytics';
import { friendlyDbError } from './dbErrors';
import { rematchReceipts } from './inbox';
import { supabase } from './supabase';

export async function addUserCards(drafts: CardDraft[]) {
  const { error } = await supabase.from('user_cards').insert(drafts.map(draftToRow));
  if (error) {
    if (error.code === '23505') throw new Error('One of these cards (same card and last 4 digits) is already in your wallet.');
    throw new Error(error.message);
  }
  track('card_added', { count: drafts.length });
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
export async function updateProfile(userId: string, patch: { is_student?: boolean; onboarded_at?: string; timezone?: string; country?: string | null; home_currency?: string; university_id?: string | null; interests?: string[]; region?: string | null; share_deals?: boolean }) {
  let { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select('id');
  if (error?.code === '22023' && patch.timezone) {
    ({ data, error } = await supabase.from('profiles').update({ ...patch, timezone: 'UTC' }).eq('id', userId).select('id'));
  }
  if (error) throw new Error(friendlyDbError('profile', error));
  if (!data?.length) throw new Error(friendlyDbError('profile', { message: 'No profile row', code: 'PGRST116' }));
}

/** "Not mine": stop suggesting a card PerkScan spotted in your email. */
export async function dismissCardSighting(id: string) {
  const { error } = await supabase.rpc('dismiss_card_sighting', { p_id: id });
  if (error) throw new Error(error.message);
}

/** Add a membership (Prime, Costco…): it has no card number, just the perks. */
export async function addMembership(cardId: string) {
  const { error } = await supabase.from('user_cards').insert({ card_id: cardId, last_four: null });
  if (error && error.code !== '23505') throw new Error(error.message); // 23505: already added
  track('membership_toggled', { on: true });
}

export async function removeMembership(userCardId: string) {
  const { error } = await supabase.from('user_cards').delete().eq('id', userCardId);
  if (error) throw new Error(error.message);
  track('membership_toggled', { on: false });
}

/** "Hide offers from this store": its marketing isn't read and its offers and deals aren't shown. */
export async function muteStore(storeKey: string, name: string | null) {
  const { error } = await supabase.from('store_mutes').upsert({ store_key: storeKey, name: name?.slice(0, 80) ?? null }, { onConflict: 'user_id,store_key' });
  if (error) throw new Error(error.message);
  track('store_muted', { on: true });
}

export async function unmuteStore(storeKey: string) {
  const { error } = await supabase.from('store_mutes').delete().eq('store_key', storeKey);
  if (error) throw new Error(error.message);
  track('store_muted', { on: false });
}
