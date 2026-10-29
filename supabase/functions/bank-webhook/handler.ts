import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankProvider } from '../_shared/bank/provider.ts';
import { connect, syncConnection } from '../_shared/bank/sync.ts';
import { json, runInBackground } from '../_shared/http.ts';

// POST /functions/v1/bank-webhook   (called by Plaid; no user session)
// Every request must carry Plaid's signature over this exact body, issued in the last 5 minutes;
// anything else is refused before it's read. Handles:
//   LINK / SESSION_FINISHED            -> the user connected (or gave up) in Hosted Link
//   TRANSACTIONS / SYNC_UPDATES_AVAILABLE -> new transactions to bring in
//   ITEM / ERROR, PENDING_EXPIRATION, PENDING_DISCONNECT -> the bank needs the user to sign in again
//   ITEM / USER_PERMISSION_REVOKED, USER_ACCOUNT_REVOKED -> access ended at the bank

export interface BankWebhookDeps {
  db: SupabaseClient; // service role
  provider: BankProvider | null;
  key: CryptoKey | null;
}

interface Hook {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  link_token?: string;
  status?: string;
  public_tokens?: string[];
  public_token?: string;
  error?: { error_code?: string } | null;
}

export function bankWebhookHandler(deps: BankWebhookDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (!deps.provider || !deps.key) return json({ error: 'Not set up' }, 503);
    const { db, provider, key } = deps;
    const raw = await req.text();
    if (raw.length > 100_000 || !(await provider.verifyWebhook(raw, req.headers))) return json({ error: 'Unverified' }, 401);

    let hook: Hook;
    try {
      hook = JSON.parse(raw) as Hook;
    } catch {
      return json({ error: 'Bad JSON' }, 400);
    }
    const byItem = async () => {
      if (!hook.item_id) return null;
      const { data } = await db.from('bank_connections').select('id').eq('provider', provider.name).eq('item_id', hook.item_id).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    };
    const setStatus = async (status: string, lastError: string | null) => {
      const id = await byItem();
      if (id) await db.from('bank_connections').update({ status, last_error: lastError }).eq('id', id);
    };

    const type = hook.webhook_type ?? '';
    const code = hook.webhook_code ?? '';
    if (type === 'LINK' && code === 'SESSION_FINISHED' && hook.link_token) {
      const { data: s } = await db.from('bank_link_sessions').select('user_id, status').eq('link_token', hook.link_token).maybeSingle();
      if (!s || s.status !== 'open') return json({ ok: true });
      const tokens = hook.public_tokens?.length ? hook.public_tokens : hook.public_token ? [hook.public_token] : [];
      const success = /^success$/i.test(hook.status ?? '') && tokens.length > 0;
      await db.from('bank_link_sessions').update({ status: success ? 'done' : 'exited' }).eq('link_token', hook.link_token);
      if (success) {
        const work = (async () => {
          for (const t of tokens) {
            try {
              await connect(db, provider, key, s.user_id as string, t);
            } catch (e) {
              console.error('bank connect failed', e instanceof Error ? e.message : e);
            }
          }
        })();
        const inline = runInBackground(work);
        if (inline) await inline;
      }
      return json({ ok: true });
    }
    if (type === 'TRANSACTIONS' && (code === 'SYNC_UPDATES_AVAILABLE' || code === 'INITIAL_UPDATE' || code === 'HISTORICAL_UPDATE' || code === 'DEFAULT_UPDATE')) {
      const id = await byItem();
      if (id) {
        const inline = runInBackground(syncConnection(db, provider, key, id).catch((e) => console.error('bank sync failed', e instanceof Error ? e.message : e)));
        if (inline) await inline;
      }
      return json({ ok: true });
    }
    if (type === 'ITEM') {
      if (code === 'USER_PERMISSION_REVOKED' || code === 'USER_ACCOUNT_REVOKED') {
        const id = await byItem();
        if (id) {
          await db.from('bank_secrets').delete().eq('connection_id', id);
          await db.from('bank_connections').update({ status: 'revoked', last_error: 'Access was turned off at your bank' }).eq('id', id);
        }
      } else if (code === 'PENDING_EXPIRATION' || code === 'PENDING_DISCONNECT' || (code === 'ERROR' && hook.error?.error_code === 'ITEM_LOGIN_REQUIRED')) {
        await setStatus('needs_login', 'Sign in to your bank again');
      } else if (code === 'ERROR') {
        await setStatus('error', 'Your bank reported a problem');
      }
    }
    return json({ ok: true });
  };
}
