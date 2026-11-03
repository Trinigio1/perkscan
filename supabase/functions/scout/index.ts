import { createClient } from '@supabase/supabase-js';
import { MODEL } from '../_shared/inbox/claude.ts';
import { claudeCardCall, claudePerkCall, claudePriceCall, claudeScoutCall } from '../_shared/scout/claude.ts';
import { scoutHandler } from './handler.ts';

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

Deno.serve(
  scoutHandler({
    db: createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } }),
    secret: Deno.env.get('SCOUT_SECRET') ?? null,
    model: apiKey ? claudeScoutCall(apiKey) : null,
    perkModel: apiKey ? claudePerkCall(apiKey) : null,
    cardModel: apiKey ? claudeCardCall(apiKey) : null,
    priceModel: apiKey ? claudePriceCall(apiKey) : null,
    options: { model: MODEL, monthlyBudgetUsd: Number(Deno.env.get('SCOUT_MONTHLY_BUDGET_USD') ?? '3') },
  }),
);
