import { createClient } from '@supabase/supabase-js';
import { claudeModelCall, MODEL } from '../_shared/inbox/claude.ts';
import { processHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve(
  processHandler({
    db,
    userFromRequest: async (req) => {
      const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!jwt) return null;
      const { data } = await db.auth.getUser(jwt);
      return data.user?.id ?? null;
    },
    model: apiKey ? claudeModelCall(apiKey) : null,
    pipeline: { model: MODEL, monthlyBudgetUsd: Number(Deno.env.get('AI_MONTHLY_BUDGET_USD') ?? '2') },
  }),
);
