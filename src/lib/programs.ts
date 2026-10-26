import type { AddType, Program } from '@/domain/programs';
import { track } from './analytics';
import { supabase } from './supabase';

// The "hidden money" catalog, and items the user adds by hand.

export async function listPrograms(): Promise<Program[]> {
  const { data, error } = await supabase
    .from('perk_programs')
    .select('id, kind, name, provider, countries, summary, how_to, url, merchants, window_days, status, last_verified, sort_order')
    .order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as Program[];
}

export async function addItem(input: {
  type: AddType;
  title: string;
  merchant?: string | null;
  amount?: number | null;
  currency?: string | null;
  expiresOn?: string | null;
  programId?: string | null;
  note?: string | null;
  /** For reminders about events that haven't been announced yet. */
  unconfirmed?: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('add_my_item', {
    p_type: input.type,
    p_title: input.title,
    p_merchant: input.merchant ?? null,
    p_amount: input.amount ?? null,
    p_currency: input.currency ?? null,
    p_expires_on: input.expiresOn ?? null,
    p_program_id: input.programId ?? null,
    p_note: input.note ?? null,
    p_unconfirmed: input.unconfirmed ?? false,
  });
  if (error) throw new Error(error.message);
  track('item_added', { type: input.type });
  return data as string;
}

export async function removeItem(id: string) {
  const { error } = await supabase.rpc('remove_my_item', { p_id: id });
  if (error) throw new Error(error.message);
}
