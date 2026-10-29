import * as WebBrowser from 'expo-web-browser';
import { track } from './analytics';
import { supabase } from './supabase';

// Connecting a bank: the server makes a Plaid Hosted Link page, the app opens it, and Plaid tells the
// server when the user finishes. PerkScan only reads transactions; it can never move money.

export interface BankConnection {
  id: string;
  institution_name: string | null;
  status: 'active' | 'needs_login' | 'error' | 'revoked';
  last_synced_at: string | null;
  last_error: string | null;
  accounts: { name: string; mask: string | null }[];
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('bank', { body });
  if (error) {
    // The function's own message ("Bank connection isn't set up yet"), not a generic one.
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error : null;
    throw new Error(msg ?? error.message);
  }
  return data as T;
}

export async function listConnections(): Promise<BankConnection[]> {
  const { data, error } = await supabase
    .from('bank_connections')
    .select('id, institution_name, status, last_synced_at, last_error, created_at')
    .order('created_at');
  // Before the bank tables exist (database not updated yet), there's simply nothing connected.
  if (error) return [];
  const { data: accts } = await supabase.from('bank_accounts').select('connection_id, name, mask');
  return (data ?? []).map((c) => ({
    ...(c as Omit<BankConnection, 'accounts'>),
    accounts: ((accts ?? []) as { connection_id: string; name: string; mask: string | null }[]).filter((a) => a.connection_id === c.id),
  }));
}

/** Opens the bank's sign-in (Plaid) and waits for it to finish. Returns whether a bank was connected. */
export async function connectBank(): Promise<boolean> {
  const { url } = await call<{ url: string | null }>({ action: 'link' });
  if (!url) throw new Error('Could not open the bank sign-in');
  track('bank_connect', { step: 'opened' });
  await WebBrowser.openBrowserAsync(url);
  // Plaid tells the server by webhook; give it a few seconds after the page closes.
  for (let i = 0; i < 10; i++) {
    const { session } = await call<{ session: 'open' | 'done' | 'exited' | null }>({ action: 'status' });
    if (session === 'done') {
      track('bank_connect', { step: 'done' });
      return true;
    }
    if (session === 'exited') return false;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

export const syncBank = (connectionId: string) => call<{ added: number }>({ action: 'sync', connection_id: connectionId });

export async function disconnectBank(connectionId: string) {
  await call({ action: 'disconnect', connection_id: connectionId });
  track('bank_connect', { step: 'disconnected' });
}
