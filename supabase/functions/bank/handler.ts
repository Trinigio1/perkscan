import type { SupabaseClient } from '@supabase/supabase-js';
import { connect, syncConnection } from '../_shared/bank/sync.ts';
import { unseal } from '../_shared/bank/crypto.ts';
import type { BankProvider } from '../_shared/bank/provider.ts';
import { CORS, json } from '../_shared/http.ts';

// POST /functions/v1/bank   (the signed-in user's session)
// { "action": "link" }                          -> a page to connect a bank (Plaid Hosted Link)
// { "action": "status" }                        -> whether the last connect finished
// { "action": "exchange", "public_token": "…" }  -> finish a connect made with the native SDK
// { "action": "sync", "connection_id": "…" }     -> bring in new transactions now
// { "action": "disconnect", "connection_id": "…" } -> stop access at the bank and forget the connection
// PerkScan only reads transactions; it can never move money.

export interface BankDeps {
  db: SupabaseClient; // service role
  provider: BankProvider | null;
  key: CryptoKey | null;
  webhookUrl: string;
  userFromRequest: (req: Request) => Promise<string | null>;
}

export function bankHandler(deps: BankDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    const userId = await deps.userFromRequest(req);
    if (!userId) return json({ error: 'Sign in first' }, 401);
    if (!deps.provider || !deps.key) return json({ error: 'Bank connection isn’t set up yet' }, 503);
    const { provider, key, db } = deps;

    let body: { action?: string; public_token?: unknown; connection_id?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Body must be JSON' }, 400);
    }
    // A connection the caller owns, or null.
    const mine = async () => {
      if (typeof body.connection_id !== 'string') return null;
      const { data } = await db.from('bank_connections').select('id').eq('id', body.connection_id).eq('user_id', userId).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    };

    try {
      switch (body.action) {
        case 'link': {
          const link = await provider.createLink({ userId, webhook: deps.webhookUrl });
          const { error } = await db.from('bank_link_sessions').insert({ link_token: link.linkToken, user_id: userId });
          if (error) throw new Error(error.message);
          return json({ url: link.url, link_token: link.linkToken, expiration: link.expiration });
        }
        case 'status': {
          const { data } = await db.from('bank_link_sessions').select('status, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
          return json({ session: data?.status ?? null });
        }
        case 'exchange': {
          if (typeof body.public_token !== 'string' || !/^public-[\w-]{10,200}$/.test(body.public_token)) return json({ error: 'Invalid public_token' }, 400);
          const id = await connect(db, provider, key, userId, body.public_token);
          return json({ connection_id: id });
        }
        case 'sync': {
          const id = await mine();
          if (!id) return json({ error: 'Not found' }, 404);
          return json(await syncConnection(db, provider, key, id));
        }
        case 'disconnect': {
          const id = await mine();
          if (!id) return json({ error: 'Not found' }, 404);
          const { data: secret } = await db.from('bank_secrets').select('access_token').eq('connection_id', id).maybeSingle();
          if (secret) {
            try {
              await provider.remove(await unseal(secret.access_token as string, key));
            } catch (e) {
              // Forget it here anyway; the bank's access ends when its token is removed or expires.
              console.error('bank remove failed', e instanceof Error ? e.message : e);
            }
          }
          const { error } = await db.from('bank_connections').delete().eq('id', id);
          if (error) throw new Error(error.message);
          return json({ disconnected: true });
        }
        default:
          return json({ error: 'Unknown action' }, 400);
      }
    } catch (e) {
      console.error('bank', body.action, e instanceof Error ? e.message : e);
      return json({ error: 'The bank connection had a problem. Please try again.' }, 502);
    }
  };
}
