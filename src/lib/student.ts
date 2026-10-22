import { track } from './analytics';
import { supabase } from './supabase';

export async function setStudentOfferClaimed(offerId: string, claimed: boolean) {
  const { error } = claimed
    ? await supabase.from('student_offer_claims').insert({ offer_id: offerId })
    : await supabase.from('student_offer_claims').delete().eq('offer_id', offerId);
  if (error && error.code !== '23505') throw new Error(error.message); // 23505: already marked
  if (claimed) track('student_offer_claimed');
}

export interface PerkDraft {
  title: string;
  details: string;
  url: string;
  suggest: boolean;
}

/** Checks a perk the user is adding; returns field errors (empty when fine). */
export function validatePerk(d: PerkDraft): Partial<Record<keyof PerkDraft, string>> {
  const e: Partial<Record<keyof PerkDraft, string>> = {};
  if (!d.title.trim()) e.title = 'Give it a short name, e.g. “Campus bookstore 10% off”.';
  else if (d.title.trim().length > 80) e.title = 'Keep it under 80 characters.';
  if (d.details.length > 280) e.details = 'Keep it under 280 characters.';
  if (d.url.trim() && !/^https?:\/\/\S+\.\S+$/.test(d.url.trim())) e.url = 'Paste a full link starting with https://';
  return e;
}

export async function saveMyPerk(d: PerkDraft, universityId: string | null, id?: string) {
  const row = { title: d.title.trim(), details: d.details.trim() || null, url: d.url.trim() || null, suggest: d.suggest, university_id: universityId };
  const { error } = id ? await supabase.from('user_perks').update(row).eq('id', id) : await supabase.from('user_perks').insert(row);
  if (error) throw new Error(error.message);
}

export async function deleteMyPerk(id: string) {
  const { error } = await supabase.from('user_perks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
