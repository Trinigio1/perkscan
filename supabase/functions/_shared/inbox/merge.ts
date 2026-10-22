import { sameMerchant } from '../merchant.ts';
import type { ReceiptRow } from './opportunities.ts';

export { sameMerchant };

// A bank's card alert and the store's own receipt usually describe the same purchase.
// They're merged into one receipt so it's never counted twice. Pure: the pipeline
// loads candidates and writes the result.

export interface ExistingReceipt {
  id: string;
  kind: 'receipt' | 'card_alert';
  pending: boolean;
  merchant: string;
  total: number | null;
  currency: string;
  purchase_date: string | null;
  last_four: string | null;
  order_number: string | null;
}

/** How far apart (in days) an alert and its receipt may be dated. */
export const MERGE_WINDOW_DAYS = 2;

const dayDiff = (a: string, b: string) => Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000;

/**
 * The existing receipt this new one duplicates, if any. Same amount and currency, dates
 * within MERGE_WINDOW_DAYS, compatible card digits and a similar merchant, and:
 *  - an alert and a store receipt (either order), or
 *  - a pending alert followed by the settled alert for the same charge.
 * Two store receipts are never merged: they're separate orders.
 */
export function findDuplicate(incoming: ReceiptRow, existing: ExistingReceipt[]): ExistingReceipt | null {
  if (incoming.total === null || !incoming.purchase_date) return null;
  for (const e of existing) {
    if (e.total === null || !e.purchase_date) continue;
    if (e.currency !== incoming.currency || Math.abs(e.total - incoming.total) > 0.005) continue;
    if (dayDiff(e.purchase_date, incoming.purchase_date) > MERGE_WINDOW_DAYS) continue;
    if (e.last_four && incoming.last_four && e.last_four !== incoming.last_four) continue;
    if (!sameMerchant(e.merchant, incoming.merchant)) continue;
    const pair = e.kind !== incoming.kind;
    const settled = e.kind === 'card_alert' && incoming.kind === 'card_alert' && e.pending && !incoming.pending;
    if (pair || settled) return e;
  }
  return null;
}

/**
 * Fields to update on the existing receipt. The store receipt's details (name, items,
 * order number, return deadline) win; the alert fills in the card digits.
 */
export function mergeFields(e: ExistingReceipt, incoming: ReceiptRow): Partial<ReceiptRow> {
  if (incoming.kind === 'card_alert') {
    // Keep the store receipt (or the earlier alert) and fill the gaps.
    return {
      last_four: e.last_four ?? incoming.last_four,
      pending: e.kind === 'receipt' ? false : incoming.pending,
    };
  }
  // A store receipt arriving after its alert takes over the row.
  return {
    ...incoming,
    kind: 'receipt',
    pending: false,
    last_four: incoming.last_four ?? e.last_four,
  };
}
