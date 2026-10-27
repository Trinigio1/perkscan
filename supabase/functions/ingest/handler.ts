import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { bearer, CORS, json, runInBackground } from '../_shared/http.ts';
import type { ModelCall } from '../_shared/inbox/parse.ts';
import { processMessages, type PipelineOptions } from '../_shared/inbox/pipeline.ts';
import { storeMessages, type IncomingMessage } from '../_shared/inbox/store.ts';

// POST /functions/v1/ingest
// Authorization: Bearer psk_<token>   (a personal token from the app, not a Supabase JWT)
// Body: { "source": "email", "messages": [{ "id", "from", "subject", "date", "text", "html" }] }
//
// POST /functions/v1/ingest/sms   (the iPhone Shortcut)
// Body: { "text": "<the message>" }   — or the batch shape above with "source": "sms"

const Message = z.object({
  id: z.string().max(200).optional(),
  from: z.string().max(500).optional(),
  subject: z.string().max(500).optional(),
  date: z.string().max(100).optional(),
  text: z.string().max(200_000).optional(),
  html: z.string().max(500_000).optional(),
});
const Batch = z.object({
  source: z.enum(['email', 'sms', 'share']).optional(),
  messages: z.array(Message).min(1).max(20),
  /** Read emails sent before again with the current reader (Gmail script: rereadAll). */
  reread: z.boolean().optional(),
});
/** What a Shortcut sends: one text, kept small. */
const SingleText = z.object({ text: z.string().trim().min(1).max(5_000) });

export { HOURLY_LIMIT } from '../_shared/inbox/store.ts';

export interface IngestDeps {
  db: SupabaseClient; // service role
  model: ModelCall | null; // null when ANTHROPIC_API_KEY isn't set: messages are stored and parsed later
  pipeline: PipelineOptions;
}

export function ingestHandler(deps: IngestDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

    const token = bearer(req);
    if (!token || !/^psk_[0-9a-f]{64}$/.test(token)) return json({ error: 'Missing or malformed token' }, 401);
    const { data: userId, error: tokenErr } = await deps.db.rpc('resolve_ingest_token', { p_token: token });
    if (tokenErr) return json({ error: 'Could not check token' }, 500);
    if (!userId) return json({ error: 'Invalid or revoked token' }, 401);

    const smsPath = /\/sms\/?$/.test(new URL(req.url).pathname);
    let source: 'email' | 'sms' | 'share';
    let messages: IncomingMessage[];
    let reread = false;
    try {
      const raw = await req.json();
      const single = SingleText.safeParse(raw);
      const batch = Batch.safeParse(raw);
      if (batch.success) {
        source = batch.data.source ?? (smsPath ? 'sms' : 'email');
        messages = batch.data.messages;
        reread = batch.data.reread === true;
      } else if (single.success) {
        source = 'sms';
        messages = [{ text: single.data.text }];
      } else {
        return json({ error: 'Invalid body', detail: batch.error.issues[0]?.message }, 400);
      }
    } catch {
      return json({ error: 'Body must be JSON' }, 400);
    }

    const stored = await storeMessages(deps.db, userId as string, source, messages, { reread });
    if (stored.error === 'rate_limited') return json({ error: 'Too many messages this hour' }, 429);
    if (stored.error) return json({ error: 'Could not store message' }, 500);

    if (stored.ids.length && deps.model) {
      const work = processMessages(deps.db, stored.ids, deps.model, deps.pipeline).catch((e) => console.error('ingest processing failed', e));
      const pending = runInBackground(work);
      if (pending) await pending; // no background runtime (local runs): finish before replying
    }
    return json({
      accepted: stored.ids.length,
      duplicates: stored.duplicates,
      muted: stored.muted ?? 0,
      capped: stored.capped ?? 0,
      // Messages with a sign-in or verification code are dropped without being stored.
      skipped_security_codes: stored.securityCodes,
      parsing: !!deps.model,
    });
  };
}
