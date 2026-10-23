import type { SupabaseClient } from '@supabase/supabase-js';
import { json } from '../_shared/http.ts';
import type { ModelCall } from '../_shared/inbox/parse.ts';
import { runScout, type ScoutOptions } from '../_shared/scout/run.ts';

// POST /functions/v1/scout   (called hourly by pg_cron, see _invoke_scout)
// Authorization: Bearer <SCOUT_SECRET>
// {}                         -> the sources due for a check
// { "only": ["courts_tt"] }  -> just these sources, now

export interface ScoutDeps {
  db: SupabaseClient; // service role
  secret: string | null;
  model: ModelCall | null;
  options: ScoutOptions;
}

/** Compares secrets without leaking how much of them matched. */
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

export function scoutHandler(deps: ScoutDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (!deps.secret || deps.secret.length < 24) return json({ error: 'SCOUT_SECRET is not set' }, 503);
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')?.trim() ?? '')?.[1]?.trim() ?? '';
    if (!(await sameSecret(token, deps.secret))) return json({ error: 'Unauthorized' }, 401);
    if (!deps.model) return json({ error: 'ANTHROPIC_API_KEY is missing' }, 503);

    let only: string[] | undefined;
    try {
      const body = (await req.json()) as { only?: unknown };
      if (Array.isArray(body.only)) only = body.only.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_]{1,60}$/.test(x)).slice(0, 10);
    } catch {
      // empty body: the sources due
    }
    try {
      return json({ sources: await runScout(deps.db, deps.model, { ...deps.options, only }) });
    } catch (e) {
      console.error('scout failed', e);
      return json({ error: 'Scout run failed' }, 500);
    }
  };
}
