import type { SupabaseClient } from '@supabase/supabase-js';
import { matchAndApply } from '../matching/apply.ts';
import { findDuplicate, mergeFields, MERGE_WINDOW_DAYS, type ExistingReceipt } from './merge.ts';
import { toRows, type ReceiptRow } from './opportunities.ts';
import { costUsd, parseEmail, type ModelCall } from './parse.ts';

export interface PipelineOptions {
  /** Hard monthly cap across all users, in USD. */
  monthlyBudgetUsd: number;
  model: string;
  today?: string;
}

export interface ProcessResult {
  id: string;
  status: 'parsed' | 'failed' | 'skipped' | 'budget';
  kind?: string;
  summary?: string;
  opportunities?: number;
  error?: string;
}

/** Give up on a message after this many tries; its raw text is deleted then. */
const MAX_ATTEMPTS = 3;

export async function monthSpendUsd(db: SupabaseClient): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await db.from('ai_usage').select('cost_usd').gte('created_at', start.toISOString());
  if (error) throw new Error(`ai_usage: ${error.message}`);
  return (data ?? []).reduce((s: number, r: { cost_usd: number | string }) => s + Number(r.cost_usd), 0);
}

/**
 * Parses stored messages one by one: claim -> model -> rows -> delete raw text.
 * `db` must be a service-role client. Safe to run twice on the same ids.
 */
export async function processMessages(db: SupabaseClient, ids: string[], call: ModelCall, opts: PipelineOptions): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  for (const id of ids) {
    if ((await monthSpendUsd(db)) >= opts.monthlyBudgetUsd) {
      await db.from('inbound_messages').update({ parse_error: 'Monthly AI budget reached; will retry next month' }).eq('id', id);
      results.push({ id, status: 'budget' });
      continue;
    }

    // Claim the message so two runs don't parse it twice.
    const { data: claimed } = await db
      .from('inbound_messages')
      .update({ parse_status: 'parsing' })
      .eq('id', id)
      .in('parse_status', ['pending', 'failed'])
      .not('raw_body', 'is', null)
      .select('id, user_id, raw_body, attempts')
      .maybeSingle();
    if (!claimed) {
      results.push({ id, status: 'skipped' });
      continue;
    }
    const attempts = (claimed.attempts as number) + 1;

    const parsed = await parseEmail(claimed.raw_body as string, call);
    await db.from('ai_usage').insert({
      user_id: claimed.user_id,
      message_id: id,
      model: opts.model,
      input_tokens: parsed.usage.inputTokens,
      output_tokens: parsed.usage.outputTokens,
      cost_usd: costUsd(parsed.usage),
    });

    if (!parsed.ok) {
      // Keep the text for a manual retry until MAX_ATTEMPTS; the hourly purge removes it after 24h regardless.
      await db
        .from('inbound_messages')
        .update({ parse_status: 'failed', parse_error: parsed.error, attempts, ...(attempts >= MAX_ATTEMPTS ? { raw_body: null } : {}) })
        .eq('id', id);
      results.push({ id, status: 'failed', error: parsed.error });
      continue;
    }

    const { data: profile } = await db.from('profiles').select('home_currency').eq('id', claimed.user_id).maybeSingle();
    const rows = toRows(parsed.data, today, (profile?.home_currency as string | undefined) ?? 'USD');
    const receiptId = rows.receipt ? await saveReceipt(db, claimed.user_id as string, id, rows.receipt) : null;

    let created = 0;
    for (const o of rows.opportunities) {
      const { error } = await db.from('opportunities').insert({
        ...o,
        user_id: claimed.user_id,
        source_message_id: id,
        source_receipt_id: o.type === 'return_window' ? receiptId : null,
      });
      if (!error) created += 1;
      else if (error.code !== '23505') throw new Error(`opportunities: ${error.message}`); // 23505 = already have this offer
    }

    // Match the receipt to a card: protections, and credits it used up.
    if (receiptId) {
      const m = await matchAndApply(db, claimed.user_id as string, [receiptId], today);
      created += m.protections;
    }

    await db
      .from('inbound_messages')
      .update({
        parse_status: parsed.data.kind === 'other' && created === 0 && !rows.receipt ? 'ignored' : 'parsed',
        kind: parsed.data.kind,
        summary: parsed.data.summary || null,
        parse_error: null,
        parsed_at: new Date().toISOString(),
        attempts,
        raw_body: null, // privacy: the email text is gone once parsed
      })
      .eq('id', id);
    results.push({ id, status: 'parsed', kind: parsed.data.kind, summary: parsed.data.summary, opportunities: created });
  }
  return results;
}

const shiftDay = (d: string, days: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};

/** Inserts a receipt, or merges it into the alert/receipt already stored for the same purchase. Returns its id. */
async function saveReceipt(db: SupabaseClient, userId: string, messageId: string, row: ReceiptRow): Promise<string> {
  if (row.total !== null && row.purchase_date) {
    const { data: candidates, error } = await db
      .from('receipts')
      .select('id, kind, pending, merchant, total, currency, purchase_date, last_four, order_number')
      .eq('user_id', userId)
      .eq('currency', row.currency)
      .eq('total', row.total)
      .gte('purchase_date', shiftDay(row.purchase_date, -MERGE_WINDOW_DAYS))
      .lte('purchase_date', shiftDay(row.purchase_date, MERGE_WINDOW_DAYS))
      .limit(10);
    if (error) throw new Error(`receipts: ${error.message}`);
    const dup = findDuplicate(
      row,
      (candidates ?? []).map((c: ExistingReceipt & { total: number | string | null }) => ({ ...c, total: c.total === null ? null : Number(c.total) })),
    );
    if (dup) {
      const { error: upErr } = await db.from('receipts').update(mergeFields(dup, row)).eq('id', dup.id);
      if (upErr) throw new Error(`receipts: ${upErr.message}`);
      return dup.id;
    }
  }
  const { data, error } = await db.from('receipts').insert({ ...row, user_id: userId, source_message_id: messageId }).select('id').single();
  if (error) throw new Error(`receipts: ${error.message}`);
  return data.id as string;
}
