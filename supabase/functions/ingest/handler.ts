import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { bearer, CORS, json, runInBackground } from '../_shared/http.ts';
import { buildModelInput, fromDomain } from '../_shared/inbox/clean.ts';
import type { ModelCall } from '../_shared/inbox/parse.ts';
import { processMessages, type PipelineOptions } from '../_shared/inbox/pipeline.ts';

// POST /functions/v1/ingest
// Authorization: Bearer psk_<token>   (a personal token from the app, not a Supabase JWT)
// Body: { "source": "email", "messages": [{ "id", "from", "subject", "date", "text", "html" }] }

const Message = z.object({
  id: z.string().max(200).optional(),
  from: z.string().max(500).optional(),
  subject: z.string().max(500).optional(),
  date: z.string().max(100).optional(),
  text: z.string().max(200_000).optional(),
  html: z.string().max(500_000).optional(),
});
const Body = z.object({
  source: z.enum(['email', 'sms', 'share']).default('email'),
  messages: z.array(Message).min(1).max(20),
});

/** Per user, per hour. Generous for personal use, stops a leaked token from running up AI costs. */
export const HOURLY_LIMIT = 200;

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

    let body: z.infer<typeof Body>;
    try {
      const parsed = Body.safeParse(await req.json());
      if (!parsed.success) return json({ error: 'Invalid body', detail: parsed.error.issues[0]?.message }, 400);
      body = parsed.data;
    } catch {
      return json({ error: 'Body must be JSON' }, 400);
    }

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await deps.db
      .from('inbound_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('received_at', since);
    if ((count ?? 0) + body.messages.length > HOURLY_LIMIT) return json({ error: 'Too many messages this hour' }, 429);

    const ids: string[] = [];
    let duplicates = 0;
    for (const m of body.messages) {
      const { data, error } = await deps.db
        .from('inbound_messages')
        .insert({
          user_id: userId,
          source: body.source,
          external_id: m.id ?? null,
          from_domain: fromDomain(m.from),
          // Store only the cleaned text the model needs (links removed, card numbers masked).
          raw_body: buildModelInput({ subject: m.subject, from: m.from, date: m.date, text: m.text, html: m.html }),
        })
        .select('id')
        .single();
      if (error?.code === '23505') duplicates += 1;
      else if (error) return json({ error: 'Could not store message' }, 500);
      else ids.push(data.id as string);
    }

    if (ids.length && deps.model) {
      const work = processMessages(deps.db, ids, deps.model, deps.pipeline).catch((e) => console.error('ingest processing failed', e));
      const pending = runInBackground(work);
      if (pending) await pending; // no background runtime (local runs): finish before replying
    }
    return json({ accepted: ids.length, duplicates, parsing: !!deps.model });
  };
}
