import { createClient } from '@supabase/supabase-js';
import { bankConfig } from '../_shared/bank/config.ts';
import { bankHandler } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const { provider, key, webhookUrl } = await bankConfig();

Deno.serve(
  bankHandler({
    db,
    provider,
    key,
    webhookUrl,
    userFromRequest: async (req) => {
      const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!jwt) return null;
      const { data } = await db.auth.getUser(jwt);
      return data.user?.id ?? null;
    },
  }),
);
