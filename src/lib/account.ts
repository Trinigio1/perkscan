import { Platform, Share } from 'react-native';
import { buildExport, EXPORT_TABLES, exportFileName, type ExportTable } from '@/domain/exportData';
import { track } from './analytics';
import { supabase } from './supabase';

/** Tables where users may only read some columns (token secrets are never readable). */
const COLUMNS: Partial<Record<ExportTable, string>> = { ingest_tokens: 'id, label, created_at, last_used_at, revoked_at' };

/** Collects everything the user can read about themselves (row-level security limits it to their rows). */
export async function exportMyData(email: string | null): Promise<{ json: string; fileName: string }> {
  const rows: Partial<Record<ExportTable, Record<string, unknown>[]>> = {};
  for (const t of EXPORT_TABLES) {
    const { data, error } = await supabase.from(t).select(COLUMNS[t] ?? '*');
    if (error) throw new Error(`${t}: ${error.message}`);
    rows[t] = (data ?? []) as unknown as Record<string, unknown>[];
  }
  const now = new Date();
  track('data_exported');
  return { json: JSON.stringify(buildExport(rows, email, now), null, 2), fileName: exportFileName(now) };
}

/** Web downloads a file; phones open the share sheet with the JSON. */
export async function deliverExport(json: string, fileName: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: fileName, message: json });
}

/** Permanently deletes the account and everything in it (server-side, needs a typed confirmation). */
export async function deleteAccount() {
  track('account_deleted');
  const { error } = await supabase.functions.invoke('account', { body: { action: 'delete', confirm: 'DELETE' } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error((body as { error?: string } | null)?.error ?? error.message);
  }
}

export async function regenerateForwardingAddress(): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_forwarding_address');
  if (error) throw new Error(error.message);
  return data as string;
}
