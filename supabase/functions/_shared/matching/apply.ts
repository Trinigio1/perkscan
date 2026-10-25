import type { SupabaseClient } from '@supabase/supabase-js';
import { matchReceipt, type BenefitIn, type OpenCreditIn, type ReceiptIn, type UserCardIn } from './match.ts';

export interface ApplySummary {
  receipts: number;
  matched: number;
  protections: number;
  creditsUsed: number;
}

/** How far back "re-check my receipts" looks. */
export const REMATCH_DAYS = 180;

type CardJoin = { product_name: string; currency: string } | { product_name: string; currency: string }[] | null;
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);

/**
 * Matches receipts to the user's cards and writes the results: the matched card,
 * protection opportunities, and credit usage. `db` must be a service-role client.
 * Idempotent: protections dedupe, and a receipt counts toward a credit only once.
 */
export async function matchAndApply(db: SupabaseClient, userId: string, receiptIds?: string[], today = new Date().toISOString().slice(0, 10)): Promise<ApplySummary> {
  let q = db
    .from('receipts')
    .select('id, merchant, total, currency, purchase_date, last_four, purchase_type, travel_date, credit_opportunity_id')
    .eq('user_id', userId);
  if (receiptIds) q = q.in('id', receiptIds);
  else q = q.gte('created_at', new Date(Date.now() - REMATCH_DAYS * 86_400_000).toISOString());
  const { data: receipts, error: rErr } = await q;
  if (rErr) throw new Error(`receipts: ${rErr.message}`);
  const summary: ApplySummary = { receipts: receipts?.length ?? 0, matched: 0, protections: 0, creditsUsed: 0 };
  if (!receipts?.length) return summary;

  const { data: ucs, error: cErr } = await db
    .from('user_cards')
    .select('id, card_id, last_four, nickname, cards(product_name, currency)')
    .eq('user_id', userId)
    .not('last_four', 'is', null); // memberships aren't paid with, so receipts never match them
  if (cErr) throw new Error(`user_cards: ${cErr.message}`);
  const cardCurrency = new Map<string, string>();
  const userCards: UserCardIn[] = (ucs ?? []).map((u) => {
    const card = one(u.cards as CardJoin);
    if (card) cardCurrency.set(u.card_id as string, card.currency);
    return {
      id: u.id as string,
      card_id: u.card_id as string,
      last_four: u.last_four as string,
      label: `${(u.nickname as string | null) || (card?.product_name ?? 'Card').replace(/®/g, '')} ending ${u.last_four}`,
    };
  });

  const cardIds = [...new Set(userCards.map((u) => u.card_id))];
  const { data: bs, error: bErr } = cardIds.length
    ? await db
        .from('card_benefits')
        .select('id, card_id, type, name, max_coverage, coverage_window_days, currency, status, merchant_match, source_url')
        .in('card_id', cardIds)
    : { data: [], error: null };
  if (bErr) throw new Error(`card_benefits: ${bErr.message}`);
  const benefits: BenefitIn[] = (bs ?? []).map((b) => ({
    ...(b as Omit<BenefitIn, 'currency' | 'max_coverage'>),
    max_coverage: b.max_coverage === null ? null : Number(b.max_coverage),
    currency: (b.currency as string | null) ?? cardCurrency.get(b.card_id as string) ?? 'USD',
  }));

  const { data: credits, error: oErr } = await db
    .from('opportunities')
    .select('id, user_card_id, benefit_id, period_start, expires_at, currency')
    .eq('user_id', userId)
    .eq('type', 'card_credit')
    .eq('status', 'open');
  if (oErr) throw new Error(`opportunities: ${oErr.message}`);
  const openCredits = (credits ?? []) as OpenCreditIn[];

  for (const raw of receipts) {
    const r: ReceiptIn = { ...(raw as ReceiptIn), total: raw.total === null ? null : Number(raw.total) };
    const m = matchReceipt(r, userCards, benefits, openCredits, today);

    await db.from('receipts').update({ matched_user_card_id: m.userCardId }).eq('id', r.id);
    if (m.userCardId) summary.matched += 1;

    for (const p of m.protections) {
      const { error } = await db.from('opportunities').insert({ ...p, user_id: userId, source_receipt_id: r.id });
      if (!error) summary.protections += 1;
      else if (error.code !== '23505') throw new Error(`protection: ${error.message}`);
    }

    if (!raw.credit_opportunity_id) {
      for (const use of m.creditUses) {
        const { data: applied, error } = await db.rpc('_auto_mark_credit_used', { p_opportunity_id: use.opportunityId, p_amount: use.amount });
        if (error) throw new Error(`credit: ${error.message}`);
        if (applied) {
          summary.creditsUsed += 1;
          await db.from('receipts').update({ credit_opportunity_id: use.opportunityId }).eq('id', r.id);
        }
      }
    }
  }
  return summary;
}
