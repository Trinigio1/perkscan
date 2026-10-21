import type { SupabaseClient } from '@supabase/supabase-js';
import { CORS, json } from '../_shared/http.ts';
import type { ModelCall } from '../_shared/inbox/parse.ts';
import { processMessages, type PipelineOptions } from '../_shared/inbox/pipeline.ts';
import { storeMessages } from '../_shared/inbox/store.ts';
import { matchAndApply } from '../_shared/matching/apply.ts';

// POST /functions/v1/process-inbox   (called from the app with the user's session)
// { "action": "retry" } -> re-parse this user's failed/pending messages
// { "action": "test" }  -> run a sample email through the whole pipeline
// { "action": "rematch" } -> re-check recent receipts against the user's cards (after adding or editing a card)
// { "action": "submit", "text": "…" } -> a text the user pasted or shared into the app
// { "action": "test_sms" } -> run a sample text through the whole pipeline, as the Shortcut would

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

/** A fictional promo text, so testing the texts setup never needs a real message. */
export function sampleText(today = new Date()) {
  const expires = new Date(today.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  return `PerkScan Test Shop: thanks for testing! Get $5 off your next order with code TEXT5, valid until ${expires}.`;
}

export function processHandler(deps: ProcessDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    const userId = await deps.userFromRequest(req);
    if (!userId) return json({ error: 'Sign in first' }, 401);
    let action = 'retry';
    let text = '';
    try {
      const body = (await req.json()) as { action?: string; text?: unknown };
      action = body.action ?? 'retry';
      text = typeof body.text === 'string' ? body.text.trim() : '';
    } catch {
      // empty body = retry
    }

    // Matching needs no AI.
    if (action === 'rematch') return json({ summary: await matchAndApply(deps.db, userId) });

    if (!deps.model) return json({ error: 'AI parsing is not set up yet (ANTHROPIC_API_KEY is missing).' }, 503);

    if (action === 'test' || action === 'test_sms') {
      const stored = await storeMessages(deps.db, userId, action === 'test' ? 'email' : 'sms', [
        action === 'test' ? { ...sampleEmail(), id: `test-${Date.now()}` } : { text: sampleText(), id: `test-sms-${Date.now()}` },
      ]);
      if (!stored.ids.length) return json({ error: stored.error === 'rate_limited' ? 'Too many messages this hour' : 'Could not create test message' }, 500);
      const [result] = await processMessages(deps.db, stored.ids, deps.model, deps.pipeline);
      return json({ result });
    }

    if (action === 'submit') {
      if (!text || text.length > 5_000) return json({ error: 'Paste a text message (up to 5,000 characters)' }, 400);
      const stored = await storeMessages(deps.db, userId, 'share', [{ text }]);
      if (stored.securityCodes) return json({ skipped: 'security_code' });
      if (stored.duplicates) return json({ skipped: 'duplicate' });
      if (stored.error === 'rate_limited') return json({ error: 'Too many messages this hour' }, 429);
      if (stored.error) return json({ error: 'Could not save that text' }, 500);
      const [result] = await processMessages(deps.db, stored.ids, deps.model, deps.pipeline);
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
