import type { InboundMessage, IngestToken } from '@/domain/types';
import { SUPABASE_URL } from './env';
import { supabase } from './supabase';

/** Where the Gmail script sends emails. */
export const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest`;
export const GMAIL_SCRIPT_URL = 'https://github.com/Trinigio1/perkscan/blob/phase-1/gmail/README.md';

export async function listMessages(limit = 50): Promise<InboundMessage[]> {
  const { data, error } = await supabase
    .from('inbound_messages')
    .select('id, source, received_at, parse_status, parse_error, kind, summary, from_domain')
    .order('received_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as InboundMessage[];
}

export async function listTokens(): Promise<IngestToken[]> {
  const { data, error } = await supabase
    .from('ingest_tokens')
    .select('id, label, created_at, last_used_at, revoked_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as IngestToken[];
}

/** Returns the plaintext token. It's shown once and never stored in readable form. */
export async function createToken(label = 'Gmail'): Promise<string> {
  const { data, error } = await supabase.rpc('create_ingest_token', { p_label: label });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function revokeToken(id: string) {
  const { error } = await supabase.rpc('revoke_ingest_token', { p_id: id });
  if (error) throw new Error(error.message);
}

async function invokeProcess(action: 'retry' | 'test' | 'rematch') {
  const { data, error } = await supabase.functions.invoke('process-inbox', { body: { action } });
  if (error) {
    // Surface the function's own message (e.g. AI not configured) when there is one.
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error((body as { error?: string } | null)?.error ?? error.message);
  }
  return data as {
    result?: { status: string; opportunities?: number; error?: string };
    results?: { status: string }[];
    summary?: { receipts: number; matched: number; protections: number; creditsUsed: number };
  };
}

export const sendTestEmail = () => invokeProcess('test');
export const retryFailed = () => invokeProcess('retry');

/**
 * Re-checks recent receipts against the user's cards, e.g. after adding a card or
 * fixing its last 4. Best effort: a failure (functions not deployed yet) is ignored.
 */
export async function rematchReceipts(): Promise<void> {
  await invokeProcess('rematch').catch(() => {});
}

export async function markOpportunity(id: string, action: 'used' | 'dismiss' | 'reopen', amount: number | null = null) {
  const { error } = await supabase.rpc('mark_opportunity', { p_opportunity_id: id, p_action: action, p_amount: amount });
  if (error) throw new Error(error.message);
}
