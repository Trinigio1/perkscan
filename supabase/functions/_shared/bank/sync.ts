import type { SupabaseClient } from '@supabase/supabase-js';
import { findDuplicate, MERGE_WINDOW_DAYS, mergeFields, type ExistingReceipt } from '../inbox/merge.ts';
import type { ReceiptRow } from '../inbox/opportunities.ts';
import { matchAndApply } from '../matching/apply.ts';
import { PlaidError } from './plaid.ts';
import type { BankProvider, SyncPage } from './provider.ts';
import { seal, unseal } from './crypto.ts';
import { purchaseFrom, type BankAccount, type BankTxn, type PurchaseRow } from './transactions.ts';

// Brings one connection's new transactions in as card-alert receipts, then runs the same matching an
// emailed card alert gets: which card it was, credits it used, protections it earned. A purchase the
// store already emailed a receipt for is merged into that receipt, never counted twice.

export interface SyncReport {
  added: number;
  updated: number;
  removed: number;
  status: 'ok' | 'needs_login' | 'error';
}

const MAX_PAGES = 20;
const shiftDay = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
// The merge helpers take a receipt row; a bank purchase has every field they read.
const asRow = (p: PurchaseRow) => ({ ...p, order_number: null }) as unknown as ReceiptRow;

/** All pages since the cursor. A change mid-way means starting over from the same cursor, as Plaid asks. */
async function allPages(provider: BankProvider, token: string, cursor: string | null): Promise<SyncPage> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const out: SyncPage = { added: [], modified: [], removed: [], nextCursor: cursor ?? '', hasMore: false };
    try {
      let c = cursor;
      for (let page = 0; page < MAX_PAGES; page++) {
        const p = await provider.sync(token, c);
        out.added.push(...p.added);
        out.modified.push(...p.modified);
        out.removed.push(...p.removed);
        out.nextCursor = p.nextCursor;
        c = p.nextCursor;
        if (!p.hasMore) return out;
      }
      return out;
    } catch (e) {
      if (e instanceof PlaidError && e.code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') continue;
      throw e;
    }
  }
  throw new Error('Bank data kept changing while syncing; will retry later');
}

async function saveTxn(db: SupabaseClient, userId: string, t: BankTxn, accounts: BankAccount[]): Promise<{ id: string; added: boolean } | null> {
  const p = purchaseFrom(t, accounts);
  if (!p) return null;
  // Already here: this transaction, or the pending one it settled.
  const ids = [t.transaction_id, ...(t.pending_transaction_id ? [t.pending_transaction_id] : [])];
  const { data: known } = await db.from('receipts').select('id, kind').eq('user_id', userId).in('bank_txn_id', ids).limit(1).maybeSingle();
  if (known) {
    // A store receipt keeps its own details; a bank row takes the settled amount and date.
    const patch = known.kind === 'receipt' ? { bank_txn_id: p.bank_txn_id, pending: false, last_four: p.last_four } : p;
    const { error } = await db.from('receipts').update(patch).eq('id', known.id);
    if (error) throw new Error(`receipts: ${error.message}`);
    return { id: known.id as string, added: false };
  }
  // The same purchase from an email (the store's receipt or the bank's alert).
  const { data: near, error: nErr } = await db
    .from('receipts')
    .select('id, kind, pending, merchant, total, currency, purchase_date, last_four, order_number, bank_txn_id')
    .eq('user_id', userId)
    .eq('currency', p.currency)
    .eq('total', p.total)
    .is('bank_txn_id', null)
    .gte('purchase_date', shiftDay(p.purchase_date, -MERGE_WINDOW_DAYS))
    .lte('purchase_date', shiftDay(p.purchase_date, MERGE_WINDOW_DAYS))
    .limit(10);
  if (nErr) throw new Error(`receipts: ${nErr.message}`);
  const dup = findDuplicate(asRow(p), (near ?? []).map((r) => ({ ...(r as ExistingReceipt), total: r.total === null ? null : Number(r.total) })));
  if (dup) {
    const { error } = await db.from('receipts').update({ ...mergeFields(dup, asRow(p)), bank_txn_id: p.bank_txn_id }).eq('id', dup.id);
    if (error) throw new Error(`receipts: ${error.message}`);
    return { id: dup.id, added: false };
  }
  const { data, error } = await db.from('receipts').insert({ ...p, user_id: userId }).select('id').single();
  if (error) throw new Error(`receipts: ${error.message}`);
  return { id: data.id as string, added: true };
}

export async function syncConnection(db: SupabaseClient, provider: BankProvider, key: CryptoKey, connectionId: string): Promise<SyncReport> {
  const { data: conn, error } = await db.from('bank_connections').select('id, user_id, cursor, status').eq('id', connectionId).single();
  if (error) throw new Error(`bank_connections: ${error.message}`);
  if (conn.status === 'revoked') return { added: 0, updated: 0, removed: 0, status: 'error' };
  const { data: secret, error: sErr } = await db.from('bank_secrets').select('access_token').eq('connection_id', connectionId).single();
  if (sErr) throw new Error(`bank_secrets: ${sErr.message}`);
  const token = await unseal(secret.access_token as string, key);
  const userId = conn.user_id as string;
  const { data: accts } = await db.from('bank_accounts').select('account_id, name, mask, type, subtype').eq('connection_id', connectionId);
  const accounts = (accts ?? []) as BankAccount[];

  let page: SyncPage;
  try {
    page = await allPages(provider, token, (conn.cursor as string | null) ?? null);
  } catch (e) {
    const needsLogin = e instanceof PlaidError && e.code === 'ITEM_LOGIN_REQUIRED';
    await db.from('bank_connections').update({ status: needsLogin ? 'needs_login' : 'error', last_error: needsLogin ? 'Sign in to your bank again' : 'Could not sync' }).eq('id', connectionId);
    return { added: 0, updated: 0, removed: 0, status: needsLogin ? 'needs_login' : 'error' };
  }

  const touched: string[] = [];
  let added = 0;
  let updated = 0;
  for (const t of [...page.added, ...page.modified]) {
    const r = await saveTxn(db, userId, t, accounts);
    if (!r) continue;
    touched.push(r.id);
    if (r.added) added += 1;
    else updated += 1;
  }
  // Gone at the bank (a pending charge that dropped, or one replaced by its settled version).
  let removed = 0;
  const gone = page.removed.map((r) => r.transaction_id);
  if (gone.length) {
    const { data: rows } = await db.from('receipts').select('id, source_message_id').eq('user_id', userId).in('bank_txn_id', gone);
    for (const r of rows ?? []) {
      // A receipt an email also described stays; it just stops pointing at the bank row.
      const q = r.source_message_id ? db.from('receipts').update({ bank_txn_id: null }).eq('id', r.id) : db.from('receipts').delete().eq('id', r.id);
      const { error: gErr } = await q;
      if (gErr) throw new Error(`receipts: ${gErr.message}`);
      removed += 1;
    }
  }
  if (touched.length) await matchAndApply(db, userId, [...new Set(touched)]);
  await db.from('bank_connections').update({ cursor: page.nextCursor, last_synced_at: new Date().toISOString(), status: 'active', last_error: null }).eq('id', connectionId);
  return { added, updated, removed, status: 'ok' };
}

/** A finished Link: exchange the token, keep the (encrypted) access token and the accounts' names and last fours, then sync. */
export async function connect(db: SupabaseClient, provider: BankProvider, key: CryptoKey, userId: string, publicToken: string): Promise<string> {
  const { accessToken, itemId } = await provider.exchange(publicToken);
  const { accounts, institutionName } = await provider.accounts(accessToken);
  const { data: conn, error } = await db
    .from('bank_connections')
    .upsert({ user_id: userId, provider: provider.name, item_id: itemId, institution_name: institutionName, status: 'active', last_error: null }, { onConflict: 'provider,item_id' })
    .select('id')
    .single();
  if (error) throw new Error(`bank_connections: ${error.message}`);
  const id = conn.id as string;
  const { error: sErr } = await db.from('bank_secrets').upsert({ connection_id: id, access_token: await seal(accessToken, key), updated_at: new Date().toISOString() });
  if (sErr) throw new Error(`bank_secrets: ${sErr.message}`);
  if (accounts.length) {
    const rows = accounts.map((a) => ({ connection_id: id, account_id: a.account_id, user_id: userId, name: a.name.slice(0, 80), mask: a.mask && /^\d{2,4}$/.test(a.mask) ? a.mask : null, type: a.type, subtype: a.subtype }));
    const { error: aErr } = await db.from('bank_accounts').upsert(rows, { onConflict: 'connection_id,account_id' });
    if (aErr) throw new Error(`bank_accounts: ${aErr.message}`);
  }
  await syncConnection(db, provider, key, id);
  return id;
}
