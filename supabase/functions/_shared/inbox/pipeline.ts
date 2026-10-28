import type { SupabaseClient } from '@supabase/supabase-js';
import { matchAndApply } from '../matching/apply.ts';
import { doubleChargeRow, isDoubleCharge, priceAdjustment, statedWarranty, type ExtraRow, type PriceProgramIn, type PurchaseIn } from '../matching/programs.ts';
import { findDuplicate, mergeFields, MERGE_WINDOW_DAYS, orderKey, type ExistingReceipt } from './merge.ts';
import { usageFrom, type OpenItem } from './usage.ts';
import { cardSighting } from './cards.ts';
import { readNote, toRows, type ReceiptRow, type RefundRule } from './opportunities.ts';
import { costUsd, parseEmail, type ModelCall } from './parse.ts';
import { PROMPT_VERSION } from './prompt.ts';
import { sightingsFrom } from './sightings.ts';

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
      .select('id, user_id, raw_body, attempts, from_domain, sent_at, subject')
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

    const { data: profile } = await db.from('profiles').select('home_currency, country, share_deals').eq('id', claimed.user_id).maybeSingle();
    const home = (profile?.home_currency as string | undefined) ?? 'USD';
    // US users get pointed to the DOT refund rule when an airline cancels and hands out a credit.
    const flightRule = parsed.data.offers.some((o) => o.after_cancellation) && (home === 'USD' || profile?.country === 'US') ? await refundRule(db, 'us_dot_flight_refunds') : null;
    const fromDomainOf = (claimed.from_domain as string | null) ?? null;
    const rows = toRows(parsed.data, today, home, flightRule, {
      sentOn: (claimed.sent_at as string | null)?.slice(0, 10) ?? null,
      fromDomain: fromDomainOf,
      subject: (claimed.subject as string | null) ?? null,
    });
    // The connection test's fictional shop: confirm it was read, but never add its code to the user's money.
    const isTest = fromDomainOf === 'test-shop.example' || /perkscan test shop/i.test(parsed.data.merchant ?? '');
    // Read again (rereadAll): this email's earlier results are replaced by what the current reader finds.
    // Anything the user acted on (used, asked about, dismissed) is kept.
    await db
      .from('opportunities')
      .delete()
      .eq('source_message_id', id)
      .eq('status', 'open')
      .is('claim_started_at', null)
      .not('dedupe_key', 'like', 'manual:%');
    if (!rows.receipt) {
      // Read again and it's not a purchase after all (an order update): drop the store receipt it made before.
      await db.from('receipts').delete().eq('user_id', claimed.user_id).eq('source_message_id', id).eq('kind', 'receipt');
    }
    const receiptId = rows.receipt ? await saveReceipt(db, claimed.user_id as string, id, rows.receipt) : null;

    let created = 0;
    let duplicates = 0;
    for (const o of isTest ? [] : rows.opportunities) {
      const { error } = await db.from('opportunities').insert({
        ...o,
        user_id: claimed.user_id,
        source_message_id: id,
        source_receipt_id: o.type === 'return_window' ? receiptId : null,
      });
      if (!error) created += 1;
      else if (error.code === '23505') {
        // Already have this offer. From this same email (it's being read again)? Then it's not a duplicate.
        const { data: had } = await db.from('opportunities').select('source_message_id').eq('user_id', claimed.user_id).eq('dedupe_key', o.dedupe_key).maybeSingle();
        if (had?.source_message_id !== id) duplicates += 1;
      } else throw new Error(`opportunities: ${error.message}`);
    }
    // A receipt that shows one of your codes or credits being applied: that item is used.
    const usage = receiptId && rows.receipt?.kind === 'receipt' && !isTest ? await applyUsage(db, claimed.user_id as string, receiptId, rows.receipt) : { used: 0, asked: 0 };
    const usedNote = usage.used ? `Marked ${usage.used} of your offers as used` : usage.asked ? 'Asked whether you used one of your offers' : null;
    const note = isTest
      ? `Connection test worked: found ${rows.opportunities.map((o) => `“${o.title}”`).join(', ') || 'the test email'} (not added to your money)`
      : usedNote ?? readNote({ created, duplicates, ...rows.skipped });
    if (isTest) created = rows.opportunities.length;

    // A card the user holds, as the email shows it (issuer, name, last 4): suggested if not added yet.
    const card = cardSighting(parsed.data, (claimed.from_domain as string | null) ?? null);
    if (card) {
      const { error } = await db.rpc('_record_card_sighting', {
        p_user: claimed.user_id,
        p_issuer: card.issuer,
        p_product: card.product,
        p_last_four: card.last_four,
        p_message: id,
      });
      if (error) console.warn('card sighting', error.message);
    }

    // Opted in: public promotions from this email may help others nearby (only store, offer, code, dates).
    if (profile?.share_deals) {
      const seen = sightingsFrom(parsed.data, (profile.country as string | null) ?? null, today);
      if (seen.length) {
        const { error } = await db.from('deal_sightings').upsert(seen.map((x) => ({ ...x, user_id: claimed.user_id, seen_at: new Date().toISOString() })), { onConflict: 'user_id,merchant_key,offer_key' });
        if (error) console.warn('deal_sightings', error.message);
      }
    }

    // Money from the purchase itself: price adjustments, a stated warranty, a possible double charge.
    if (receiptId) {
      const extras = await purchaseExtras(db, claimed.user_id as string, receiptId, parsed.data.receipt?.warranty_months ?? null, (profile?.country as string | null) ?? null, today);
      for (const o of extras) {
        const { error } = await db.from('opportunities').insert({ ...o, user_id: claimed.user_id, source_message_id: id, source_receipt_id: receiptId });
        if (!error) created += 1;
        else if (error.code !== '23505') throw new Error(`opportunities: ${error.message}`);
      }
    }

    // Match the receipt to a card: protections, and credits it used up.
    if (receiptId) {
      const m = await matchAndApply(db, claimed.user_id as string, [receiptId], today);
      created += m.protections;
      // A new purchase may fall inside a known class-action settlement.
      const s = await db.rpc('_match_settlements_for_user', { p_user: claimed.user_id });
      if (s.error) console.warn('settlement matching failed', s.error.message);
    }

    await db
      .from('inbound_messages')
      .update({
        parse_status: parsed.data.kind === 'other' && created === 0 && !rows.receipt && !card ? 'ignored' : 'parsed',
        kind: parsed.data.kind,
        summary: parsed.data.summary || null,
        read_note: note,
        membership_seen: parsed.data.membership ?? null,
        parse_error: null,
        parsed_at: new Date().toISOString(),
        parser_version: `${opts.model}/${PROMPT_VERSION}`,
        attempts,
        raw_body: null, // privacy: the email text is gone once parsed
      })
      .eq('id', id);
    results.push({ id, status: 'parsed', kind: parsed.data.kind, summary: parsed.data.summary, opportunities: created });
  }
  return results;
}

/** An active refund rule from the programs catalog, or null. */
async function refundRule(db: SupabaseClient, id: string): Promise<RefundRule | null> {
  const { data } = await db.from('perk_programs').select('how_to, url').eq('id', id).eq('status', 'active').maybeSingle();
  return data?.how_to && data?.url ? { how_to: data.how_to as string, url: data.url as string } : null;
}

const shiftDay = (d: string, days: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};

/** Inserts a receipt, or merges it into the alert/receipt already stored for the same purchase. Returns its id. */
/**
 * Matches a receipt's discount lines to the user's open codes, gift cards and credits (see usage.ts):
 * a clear match is marked used, a possible one is asked about on Home (never replacing an earlier question).
 */
async function applyUsage(db: SupabaseClient, userId: string, receiptId: string, row: ReceiptRow): Promise<{ used: number; asked: number }> {
  const out = { used: 0, asked: 0 };
  if (!row.discounts?.length) return out;
  const { data, error } = await db
    .from('opportunities')
    .select('id, type, title, merchant, code, value_estimate, currency, expires_at, created_at, used_guess_receipt_id, used_guess_declined_at, inbound_messages(sent_at)')
    .eq('user_id', userId)
    .eq('status', 'open')
    .in('type', ['promo', 'gift_card', 'store_credit', 'travel_credit', 'certificate'])
    .limit(500);
  if (error) {
    console.warn('usage: open items', error.message);
    return out;
  }
  type Loaded = Omit<OpenItem, 'seen_on'> & { created_at: string; used_guess_receipt_id: string | null; inbound_messages?: { sent_at: string | null } | null };
  const rows = (data ?? []) as unknown as Loaded[];
  const items: OpenItem[] = rows.map(({ inbound_messages: msg, created_at, ...o }) => ({ ...o, value_estimate: o.value_estimate === null ? null : Number(o.value_estimate), seen_on: msg?.sent_at ?? created_at }));
  const matches = usageFrom({ merchant: row.merchant, purchase_date: row.purchase_date, currency: row.currency, discounts: row.discounts }, items);
  for (const m of matches) {
    if (m.how === 'used') {
      const { data: done, error: e } = await db.rpc('_mark_used_from_receipt', { p_opportunity_id: m.id, p_amount: m.amount, p_receipt_id: receiptId, p_line: m.line });
      if (e) console.warn('usage: mark used', e.message);
      else if (done) out.used += 1;
    } else {
      const { data: asked, error: e } = await db
        .from('opportunities')
        .update({ used_guess_receipt_id: receiptId, used_guess_amount: m.amount, used_guess_line: m.line })
        .eq('id', m.id)
        .is('used_guess_receipt_id', null)
        .select('id');
      if (e) console.warn('usage: ask', e.message);
      else if (asked?.length) out.asked += 1;
    }
  }
  return out;
}

const RECEIPT_FIELDS = 'id, kind, pending, merchant, total, currency, purchase_date, last_four, order_number';
const asExisting = (c: ExistingReceipt & { total: number | string | null }): ExistingReceipt => ({ ...c, total: c.total === null ? null : Number(c.total) });

async function saveReceipt(db: SupabaseClient, userId: string, messageId: string, row: ReceiptRow): Promise<string> {
  // This email was read before (rereadAll): update its receipt rather than adding another.
  const { data: mine, error: mineErr } = await db.from('receipts').select('id').eq('user_id', userId).eq('source_message_id', messageId).limit(1).maybeSingle();
  if (mineErr) throw new Error(`receipts: ${mineErr.message}`);
  if (mine) {
    const { error } = await db.from('receipts').update(row).eq('id', mine.id);
    if (error) throw new Error(`receipts: ${error.message}`);
    return mine.id as string;
  }

  const candidates: ExistingReceipt[] = [];
  // Another email about the same order (booking confirmation, e-ticket, invoice), whatever its amount.
  if (row.kind === 'receipt' && orderKey(row.order_number)) {
    const { data, error } = await db.from('receipts').select(RECEIPT_FIELDS).eq('user_id', userId).eq('kind', 'receipt').not('order_number', 'is', null).limit(200);
    if (error) throw new Error(`receipts: ${error.message}`);
    candidates.push(...(data ?? []).map(asExisting).filter((c) => orderKey(c.order_number) === orderKey(row.order_number)));
  }
  if (row.total !== null && row.purchase_date) {
    const { data, error } = await db
      .from('receipts')
      .select(RECEIPT_FIELDS)
      .eq('user_id', userId)
      .eq('currency', row.currency)
      .eq('total', row.total)
      .gte('purchase_date', shiftDay(row.purchase_date, -MERGE_WINDOW_DAYS))
      .lte('purchase_date', shiftDay(row.purchase_date, MERGE_WINDOW_DAYS))
      .limit(10);
    if (error) throw new Error(`receipts: ${error.message}`);
    candidates.push(...(data ?? []).map(asExisting));
  }
  const dup = findDuplicate(row, candidates);
  if (dup) {
    const { error: upErr } = await db.from('receipts').update(mergeFields(dup, row)).eq('id', dup.id);
    if (upErr) throw new Error(`receipts: ${upErr.message}`);
    return dup.id;
  }
  const { data, error } = await db.from('receipts').insert({ ...row, user_id: userId, source_message_id: messageId }).select('id').single();
  if (error) throw new Error(`receipts: ${error.message}`);
  return data.id as string;
}

/** Price adjustment, stated warranty and double-charge checks for a saved receipt. */
async function purchaseExtras(db: SupabaseClient, userId: string, receiptId: string, warrantyMonths: number | null, country: string | null, today: string): Promise<ExtraRow[]> {
  const cols = 'id, kind, pending, merchant, total, currency, purchase_date, return_by, last_four, purchase_type';
  const { data: r, error } = await db.from('receipts').select(cols).eq('id', receiptId).single();
  if (error) throw new Error(`receipts: ${error.message}`);
  const p: PurchaseIn = { ...(r as PurchaseIn), total: r.total === null ? null : Number(r.total) };
  const rows: ExtraRow[] = [];

  const { data: programs, error: pErr } = await db
    .from('perk_programs')
    .select('id, name, countries, merchants, window_days, how_to, url, status, kind')
    .in('kind', ['price_adjust', 'refund_rule']);
  if (pErr) throw new Error(`perk_programs: ${pErr.message}`);
  const adjust = priceAdjustment(p, (programs ?? []).filter((x) => x.kind === 'price_adjust') as PriceProgramIn[], country, today);
  if (adjust) rows.push(adjust);
  const warranty = statedWarranty(p, warrantyMonths, today);
  if (warranty) rows.push(warranty);

  if (p.kind === 'card_alert' && p.total !== null && p.purchase_date && p.last_four) {
    const { data: same, error: sErr } = await db
      .from('receipts')
      .select(cols)
      .eq('user_id', userId)
      .eq('kind', 'card_alert')
      .eq('total', p.total)
      .eq('currency', p.currency)
      .eq('last_four', p.last_four)
      .eq('purchase_date', p.purchase_date)
      .neq('id', p.id)
      .limit(5);
    if (sErr) throw new Error(`receipts: ${sErr.message}`);
    if ((same ?? []).some((o) => isDoubleCharge(p, { ...(o as PurchaseIn), total: o.total === null ? null : Number(o.total) }))) {
      // US cards get the official dispute rules; elsewhere, the bank is the way.
      const usRule = p.currency === 'USD' || country === 'US' ? (programs ?? []).find((x) => x.id === 'us_billing_errors') : undefined;
      rows.push(doubleChargeRow(p, usRule ? { how_to: usRule.how_to as string, url: usRule.url as string } : null));
    }
  }
  return rows;
}
