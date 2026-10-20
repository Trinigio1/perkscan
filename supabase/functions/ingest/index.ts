import { createClient } from '@supabase/supabase-js';
import { claudeModelCall, MODEL } from '../_shared/inbox/claude.ts';
import { ingestHandler } from './handler.ts';

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

Deno.serve(
  ingestHandler({
    db: createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } }),
    model: apiKey ? claudeModelCall(apiKey) : null,
    pipeline: { model: MODEL, monthlyBudgetUsd: Number(Deno.env.get('AI_MONTHLY_BUDGET_USD') ?? '2') },
  }),
);
