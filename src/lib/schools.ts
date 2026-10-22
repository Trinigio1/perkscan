import type { University } from '@/domain/types';
import { supabase } from './supabase';

export const SCHOOL_COLUMNS = 'id, name, short_name, country, state, email_domains, website';

/** Letters, digits and a few name characters only, so the text is safe inside a filter. */
const clean = (q: string) => q.replace(/[^\p{L}\p{N} &.'-]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Schools in a country. With a search, matches the name, short name or website
 * (so "ufl" finds the University of Florida). Without one, the first schools in the list.
 */
export async function searchSchools(country: string | null, query: string, limit = 40): Promise<University[]> {
  let q = supabase.from('universities').select(SCHOOL_COLUMNS);
  if (country) q = q.eq('country', country);
  const term = clean(query);
  if (term) q = q.or(`name.ilike.%${term}%,short_name.ilike.%${term}%,website.ilike.%${term}%`);
  const { data, error } = await q.order('sort_order').limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as University[];
}
