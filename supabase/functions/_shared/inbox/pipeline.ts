import type { SupabaseClient } from '@supabase/supabase-js';
import { toRows } from './opportunities.ts';
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

    const rows = toRows(parsed.data, today);
    let receiptId: string | null = null;
    if (rows.receipt) {
      let matched: string | null = null;
      if (rows.receipt.last_four) {
        const { data: cards } = await db.from('user_cards').select('id').eq('user_id', claimed.user_id).eq('last_four', rows.receipt.last_four);
        if (cards?.length === 1) matched = cards[0]!.id as string;
      }
      const { data: rec, error } = await db
        .from('receipts')
        .insert({ ...rows.receipt, user_id: claimed.user_id, source_message_id: id, matched_user_card_id: matched })
        .select('id')
        .single();
      if (error) throw new Error(`receipts: ${error.message}`);
      receiptId = rec.id as string;
    }

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
