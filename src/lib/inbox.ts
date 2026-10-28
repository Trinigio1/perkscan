import type { InboundMessage, IngestToken } from '@/domain/types';
import { track } from './analytics';
import { SUPABASE_URL } from './env';
import { supabase } from './supabase';

/** Where the Gmail script sends emails. */
export const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest`;
/** Where the iPhone Shortcut sends texts. */
export const INGEST_SMS_URL = `${SUPABASE_URL}/functions/v1/ingest/sms`;
/** A ready-made iCloud Shortcut, once one is published (EXPO_PUBLIC_SHORTCUT_URL). */
export const SHORTCUT_URL = (process.env.EXPO_PUBLIC_SHORTCUT_URL ?? '').trim() || null;
export const GMAIL_SCRIPT_URL = 'https://github.com/Trinigio1/perkscan/blob/phase-1/gmail/README.md';

/** Newest first; `offset` skips that many for "Show more". */
export async function listMessages(limit = 50, offset = 0): Promise<InboundMessage[]> {
  const { data, error } = await supabase
    .from('inbound_messages')
    .select('id, source, received_at, parse_status, parse_error, kind, summary, from_domain, read_note')
    .order('received_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data as InboundMessage[];
}

export interface MessageTotals {
  /** Every email and text PerkScan has received. */
  total: number;
  /** Of those, still waiting to be read. */
  waiting: number;
}

/** True totals across everything received, not just the page on screen (counts only, no rows). */
export async function countMessages(): Promise<MessageTotals> {
  const count = async (statuses?: string[]) => {
    let q = supabase.from('inbound_messages').select('id', { count: 'exact', head: true });
    if (statuses) q = q.in('parse_status', statuses);
    const { count: n, error } = await q;
    if (error) throw new Error(error.message);
    return n ?? 0;
  };
  const [total, waiting] = await Promise.all([count(), count(['pending', 'parsing'])]);
  return { total, waiting };
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
  track(label.startsWith('iPhone') ? 'texts_token_created' : 'gmail_token_created');
  return data as string;
}

export async function revokeToken(id: string) {
  const { error } = await supabase.rpc('revoke_ingest_token', { p_id: id });
  if (error) throw new Error(error.message);
}

async function invokeProcess(action: 'retry' | 'test' | 'test_sms' | 'rematch' | 'submit', text?: string) {
  const { data, error } = await supabase.functions.invoke('process-inbox', { body: { action, text } });
  if (error) {
    // Surface the function's own message (e.g. AI not configured) when there is one.
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error((body as { error?: string } | null)?.error ?? error.message);
  }
  return data as {
    result?: { status: string; kind?: string; opportunities?: number; error?: string };
    results?: { status: string }[];
    summary?: { receipts: number; matched: number; protections: number; creditsUsed: number };
    skipped?: 'security_code' | 'duplicate';
  };
}

export const sendTestEmail = () => invokeProcess('test');
export const retryFailed = () => invokeProcess('retry');
export const sendTestText = () => invokeProcess('test_sms');
/** A text the user pasted or shared into the app. */
export async function submitText(text: string) {
  try {
    const r = await invokeProcess('submit', text);
    track('text_added', { result: r.skipped ?? (r.result?.status === 'parsed' ? 'parsed' : 'failed') });
    return r;
  } catch (e) {
    track('text_added', { result: 'failed' });
    throw e;
  }
}

/**
 * Re-checks recent receipts against the user's cards, e.g. after adding a card or
 * fixing its last 4. Best effort: a failure (functions not deployed yet) is ignored.
 */
export async function rematchReceipts(): Promise<void> {
  await invokeProcess('rematch').catch(() => {});
}

/** Answers "Did you use this on your Oct 20 Uber Eats order?". Yes marks it used with what the receipt took off. */
export async function answerUsedGuess(id: string, used: boolean) {
  const { error } = await supabase.rpc('answer_used_guess', { p_opportunity_id: id, p_used: used });
  if (error) throw new Error(error.message);
}

export async function markOpportunity(id: string, action: 'used' | 'dismiss' | 'reopen', amount: number | null = null) {
  const { error } = await supabase.rpc('mark_opportunity', { p_opportunity_id: id, p_action: action, p_amount: amount });
  if (error) throw new Error(error.message);
}
