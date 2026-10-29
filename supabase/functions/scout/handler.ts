import type { SupabaseClient } from '@supabase/supabase-js';
import { json } from '../_shared/http.ts';
import type { ModelCall } from '../_shared/inbox/parse.ts';
import { runPerkScout, type PerkScoutReport } from '../_shared/perkscout/run.ts';
import { runPriceWatch, type PriceWatchReport } from '../_shared/pricewatch/run.ts';
import { discoverStores, type DiscoverReport } from '../_shared/scout/discover.ts';
import { runScout, type ScoutOptions } from '../_shared/scout/run.ts';

// POST /functions/v1/scout   (called hourly by pg_cron, see _invoke_scout)
// Authorization: Bearer <SCOUT_SECRET>
// {}                         -> look up a couple of new stores, check prices and perks, then read the sources due for a check
// { "only": ["courts_tt"] }  -> just these sources, now

export interface ScoutDeps {
  db: SupabaseClient; // service role
  secret: string | null;
  model: ModelCall | null;
  /** Reads a store's rewards page (a different question from the promotions model). */
  perkModel?: ModelCall | null;
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
    // Finding new stores costs no AI; a failure there never stops the regular reading.
    let discovered: DiscoverReport[] = [];
    if (!only) {
      try {
        discovered = await discoverStores(deps.db, { fetch: deps.options.fetch });
      } catch (e) {
        console.error('store discovery failed', e);
      }
    }
    // Price drops on purchases still inside their store's window: no AI, a capped number of pages.
    let prices: PriceWatchReport | null = null;
    if (!only) {
      try {
        prices = await runPriceWatch(deps.db, { fetch: deps.options.fetch });
      } catch (e) {
        console.error('price watch failed', e);
      }
    }
    // Free perk programs at stores people buy from that the catalog doesn't cover yet.
    let perks: PerkScoutReport[] = [];
    if (!only && deps.perkModel) {
      try {
        perks = await runPerkScout(deps.db, deps.perkModel, { model: deps.options.model, monthlyBudgetUsd: deps.options.monthlyBudgetUsd, fetch: deps.options.fetch });
      } catch (e) {
        console.error('perk scout failed', e);
      }
    }
    try {
      return json({ discovered, prices, perks, sources: await runScout(deps.db, deps.model, { ...deps.options, only }) });
    } catch (e) {
      console.error('scout failed', e);
      return json({ error: 'Scout run failed' }, 500);
    }
  };
}
