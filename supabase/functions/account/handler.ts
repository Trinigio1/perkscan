import type { SupabaseClient } from '@supabase/supabase-js';
import { CORS, json } from '../_shared/http.ts';

// POST /functions/v1/account   (the signed-in user's session)
// { "action": "delete", "confirm": "DELETE" } -> permanently deletes the account and everything in it.
// Every table holding user data references auth.users with ON DELETE CASCADE, so deleting the
// auth user removes cards, messages, receipts, offers, reviews, perks and tokens in one step.

export interface AccountDeps {
  db: SupabaseClient; // service role (deleting an auth user needs it)
  userFromRequest: (req: Request) => Promise<string | null>;
}

export function accountHandler(deps: AccountDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    const userId = await deps.userFromRequest(req);
    if (!userId) return json({ error: 'Sign in first' }, 401);

    let body: { action?: string; confirm?: string } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Body must be JSON' }, 400);
    }
    if (body.action !== 'delete') return json({ error: 'Unknown action' }, 400);
    // A typed confirmation, so a stray request can't wipe an account.
    if (body.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm' }, 400);

    const { error } = await deps.db.auth.admin.deleteUser(userId);
    if (error) return json({ error: 'Could not delete the account. Nothing was deleted; please try again.' }, 500);
    return json({ deleted: true });
  };
}
