import type { Opportunity, Receipt, Recovered } from './types';

// "Did you use it?" answered by receipts (the reader marks clear matches; see supabase/functions/_shared/inbox/usage.ts).
// Here: what to ask on Home, and how to say where a "used" came from. Pure, so tested.

export interface UsedQuestion {
  opp: Opportunity;
  receipt: Pick<Receipt, 'id' | 'merchant' | 'purchase_date'>;
  /** What the receipt took off, if it said. */
  amount: number | null;
}

const shortDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Open items a receipt might have used, newest receipt first. */
export function usedQuestions(opportunities: Opportunity[], receipts: Pick<Receipt, 'id' | 'merchant' | 'purchase_date'>[]): UsedQuestion[] {
  const out: UsedQuestion[] = [];
  for (const o of opportunities) {
    if (o.status !== 'open' || !o.used_guess_receipt_id) continue;
    const receipt = receipts.find((r) => r.id === o.used_guess_receipt_id);
    if (receipt) out.push({ opp: o, receipt, amount: o.used_guess_amount ?? null });
  }
  return out.sort((a, b) => (b.receipt.purchase_date ?? '').localeCompare(a.receipt.purchase_date ?? ''));
}

/** "on your Oct 20 Uber Eats order" */
export function orderPhrase(r: Pick<Receipt, 'merchant' | 'purchase_date'>): string {
  return `on your ${r.purchase_date ? `${shortDate(r.purchase_date)} ` : ''}${r.merchant} order`;
}

/** "Spotted on your Oct 20 Uber Eats receipt", for items PerkScan marked used from a receipt. */
export function usedFromReceiptNote(
  oppId: string,
  recovered: Pick<Recovered, 'opportunity_id' | 'marked_by' | 'source_receipt_id'>[],
  receipts: Pick<Receipt, 'id' | 'merchant' | 'purchase_date'>[],
): string | null {
  const rec = recovered.find((r) => r.opportunity_id === oppId && r.source_receipt_id);
  const receipt = rec ? receipts.find((r) => r.id === rec.source_receipt_id) : undefined;
  if (!rec || !receipt) return null;
  const when = receipt.purchase_date ? `${shortDate(receipt.purchase_date)} ` : '';
  return rec.marked_by === 'auto' ? `Spotted on your ${when}${receipt.merchant} receipt` : `Used on your ${when}${receipt.merchant} order`;
}
