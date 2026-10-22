import { supabase } from './supabase';

export async function setStudentOfferClaimed(offerId: string, claimed: boolean) {
  const { error } = claimed
    ? await supabase.from('student_offer_claims').insert({ offer_id: offerId })
    : await supabase.from('student_offer_claims').delete().eq('offer_id', offerId);
  if (error && error.code !== '23505') throw new Error(error.message); // 23505: already marked
}
