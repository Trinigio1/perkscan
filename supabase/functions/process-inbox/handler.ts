import type { SupabaseClient } from '@supabase/supabase-js';
import { CORS, json } from '../_shared/http.ts';
import { buildModelInput } from '../_shared/inbox/clean.ts';
import type { ModelCall } from '../_shared/inbox/parse.ts';
import { processMessages, type PipelineOptions } from '../_shared/inbox/pipeline.ts';

// POST /functions/v1/process-inbox   (called from the app with the user's session)
// { "action": "retry" } -> re-parse this user's failed/pending messages
// { "action": "test" }  -> run a sample email through the whole pipeline

export interface ProcessDeps {
  db: SupabaseClient; // service role
  /** Returns the signed-in user's id for the request's Authorization header, or null. */
  userFromRequest: (req: Request) => Promise<string | null>;
  model: ModelCall | null;
  pipeline: PipelineOptions;
}

/** A fictional promo, so testing never needs a real email. */
export function sampleEmail(today = new Date()) {
  const expires = new Date(today.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  return {
    subject: 'A thank-you from PerkScan Test Shop',
    from: 'PerkScan Test Shop <hello@test-shop.example>',
    date: today.toISOString().slice(0, 10),
    text: `Thanks for testing PerkScan!\n\nHere's $10 off your next order of $50 or more with code THANKS10.\nThe code expires on ${expires}.\n\nUnsubscribe | Privacy policy`,
  };
}

export function processHandler(deps: ProcessDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    const userId = await deps.userFromRequest(req);
    if (!userId) return json({ error: 'Sign in first' }, 401);
    if (!deps.model) return json({ error: 'AI parsing is not set up yet (ANTHROPIC_API_KEY is missing).' }, 503);

    let action = 'retry';
    try {
      action = ((await req.json()) as { action?: string }).action ?? 'retry';
    } catch {
      // empty body = retry
    }

    if (action === 'test') {
      const { data, error } = await deps.db
        .from('inbound_messages')
        .insert({ user_id: userId, source: 'email', external_id: `test-${Date.now()}`, from_domain: 'example', raw_body: buildModelInput(sampleEmail()) })
        .select('id')
        .single();
      if (error) return json({ error: 'Could not create test message' }, 500);
      const [result] = await processMessages(deps.db, [data.id as string], deps.model, deps.pipeline);
      return json({ result });
    }

    if (action !== 'retry') return json({ error: 'Unknown action' }, 400);
    const { data: rows } = await deps.db
      .from('inbound_messages')
      .select('id')
      .eq('user_id', userId)
      .in('parse_status', ['pending', 'failed'])
      .not('raw_body', 'is', null)
      .order('received_at')
      .limit(20);
    const results = await processMessages(deps.db, (rows ?? []).map((r: { id: string }) => r.id), deps.model, deps.pipeline);
    return json({ results });
  };
}
