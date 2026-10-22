import type { Accuracy, WrongField } from '@/domain/accuracy';
import type { InboundMessage } from '@/domain/types';
import { track } from './analytics';
import { supabase } from './supabase';

// Reviews of what PerkScan read from each email or text ("right" / "something's wrong").

export interface ReadOffer {
  id: string;
  type: string;
  title: string;
  value_estimate: number | null;
  currency: string;
  code: string | null;
  expires_at: string | null;
  merchant: string | null;
  status: string;
}

export interface ReadPurchase {
  id: string;
  merchant: string;
  total: number | null;
  currency: string;
  purchase_date: string | null;
  last_four: string | null;
  kind: 'receipt' | 'card_alert';
  pending: boolean;
}

export interface ReviewItem {
  message: InboundMessage;
  offers: ReadOffer[];
  purchases: ReadPurchase[];
  review: { verdict: 'right' | 'wrong'; wrong_fields: WrongField[] } | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Messages PerkScan has read, newest first, each with what it found and any review. */
export async function listForReview(messageId?: string): Promise<ReviewItem[]> {
  let q = supabase
    .from('inbound_messages')
    .select('id, source, received_at, parse_status, parse_error, kind, summary, from_domain')
    .in('parse_status', ['parsed', 'ignored'])
    .order('received_at', { ascending: false })
    .limit(100);
  if (messageId) q = q.eq('id', messageId);
  const { data: messages, error } = await q;
  if (error) throw new Error(error.message);
  const ids = (messages ?? []).map((m) => m.id as string);
  if (!ids.length) return [];

  const [offers, purchases, reviews] = await Promise.all([
    supabase
      .from('opportunities')
      .select('id, type, title, value_estimate, currency, code, expires_at, merchant, status, source_message_id')
      .in('source_message_id', ids)
      .neq('type', 'protection'), // protections come from card terms, not from reading the message
    supabase
      .from('receipts')
      .select('id, merchant, total, currency, purchase_date, last_four, kind, pending, source_message_id')
      .in('source_message_id', ids),
    supabase.from('parse_feedback').select('message_id, verdict, wrong_fields').in('message_id', ids),
  ]);
  for (const r of [offers, purchases, reviews]) if (r.error) throw new Error(r.error.message);

  return (messages as InboundMessage[]).map((message) => ({
    message,
    offers: (offers.data ?? [])
      .filter((o) => o.source_message_id === message.id)
      .map((o) => ({ ...(o as ReadOffer), value_estimate: num(o.value_estimate) })),
    purchases: (purchases.data ?? [])
      .filter((p) => p.source_message_id === message.id)
      .map((p) => ({ ...(p as ReadPurchase), total: num(p.total) })),
    review: ((reviews.data ?? []).find((r) => r.message_id === message.id) as ReviewItem['review'] | undefined) ?? null,
  }));
}

export interface Corrections {
  amount?: number;
  currency?: string;
  code?: string;
  expires_on?: string;
  merchant?: string;
  last_four?: string;
  purchase_date?: string;
}

export async function submitReview(input: {
  messageId: string;
  verdict: 'right' | 'wrong';
  wrongFields?: WrongField[];
  corrected?: Corrections;
  note?: string;
  opportunityId?: string | null;
  receiptId?: string | null;
}) {
  const { error } = await supabase.rpc('submit_parse_feedback', {
    p_message_id: input.messageId,
    p_verdict: input.verdict,
    p_wrong_fields: input.wrongFields ?? [],
    p_corrected: input.corrected ?? {},
    p_note: input.note?.trim() || null,
    p_opportunity_id: input.opportunityId ?? null,
    p_receipt_id: input.receiptId ?? null,
  });
  if (error) throw new Error(error.message);
  track('review_submitted', { verdict: input.verdict });
}

export async function getAccuracy(): Promise<Accuracy> {
  const { data, error } = await supabase.rpc('my_parse_accuracy');
  if (error) throw new Error(error.message);
  return data as Accuracy;
}
