import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModelCall } from '../inbox/parse.ts';
import { costUsd } from '../inbox/parse.ts';
import { findSitePage, knownDomain } from '../scout/discover.ts';
import { readPage, type Fetch } from '../scout/page.ts';
import { scoutSpendUsd } from '../scout/run.ts';
import { checkPerkPage } from './check.ts';
import { perkMessage, PerkPageSchema, type PerkPage } from './extract.ts';
import { PERK_SPEC } from './find.ts';

// Hidden value for every user, without anyone adding it by hand: stores people buy from that the catalog
// has no perk for are looked up on their own website. A free rewards program found there is published
// with the page quotes it rests on, and shows up in "Perks for you" for everyone who shops there.
// Programs that state dollar amounts wait in perk_candidates for a person to approve. Every scouted
// program is re-read monthly and hidden if its page stops backing it up.

export interface PerkScoutReport {
  store: string;
  country: string;
  result: string;
}

const RECHECK_DAYS = 30;

const programId = (country: string, storeKey: string) => `scout_${country.toLowerCase()}_${storeKey}`.slice(0, 60);

export function parsePerkPage(text: string | null): PerkPage | null {
  if (!text) return null;
  try {
    const r = PerkPageSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

async function readProgram(db: SupabaseClient, call: ModelCall, model: string, url: string, store: string, domain: string, fetchImpl?: Fetch) {
  const page = await readPage(url, fetchImpl);
  if (!page.ok) return { ok: false as const, reason: page.error };
  let res: Awaited<ReturnType<ModelCall>>;
  try {
    res = await call(perkMessage({ store, domain, text: page.text }));
  } catch {
    return { ok: false as const, reason: 'model call failed' };
  }
  await db.from('ai_usage').insert({ user_id: null, model, input_tokens: res.inputTokens, output_tokens: res.outputTokens, cost_usd: costUsd(res) });
  const parsed = res.stopReason === 'refusal' ? null : parsePerkPage(res.text);
  if (!parsed) return { ok: false as const, reason: 'could not read the page' };
  return checkPerkPage(parsed, { page: page.text, domain });
}

export async function runPerkScout(
  db: SupabaseClient,
  call: ModelCall,
  opts: { model: string; monthlyBudgetUsd: number; fetch?: Fetch; today?: string; perRun?: number },
): Promise<PerkScoutReport[]> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const perRun = opts.perRun ?? 3;
  const reports: PerkScoutReport[] = [];
  const overBudget = async () => (await scoutSpendUsd(db)) >= opts.monthlyBudgetUsd;

  // 1. New stores.
  const { data, error } = await db.rpc('_perk_store_candidates', { p_limit: perRun * 5 });
  if (error) throw new Error(`_perk_store_candidates: ${error.message}`);
  let looked = 0;
  for (const c of (data ?? []) as { country: string; store_key: string; name: string; domain: string | null; users: number }[]) {
    if (looked >= perRun) break;
    const known = knownDomain(c.store_key);
    // A store only one person buys from stays private: it's never looked up unless it's a well-known chain.
    if (c.users < 2 && !known) continue;
    const domain = c.domain ?? known;
    const mark = (result: string, d: string | null = domain) =>
      db.from('perk_store_checks').upsert({ store_key: c.store_key, country: c.country, domain: d, result, checked_at: new Date().toISOString() }, { onConflict: 'store_key,country' });
    if (!domain) {
      await mark('no official site known', null);
      reports.push({ store: c.store_key, country: c.country, result: 'no official site known' });
      continue;
    }
    if (await overBudget()) {
      reports.push({ store: c.store_key, country: c.country, result: 'budget' });
      return reports;
    }
    looked += 1;
    const found = await findSitePage(domain, PERK_SPEC, opts.fetch);
    if (!('via' in found)) {
      await mark(found.reason);
      reports.push({ store: c.store_key, country: c.country, result: found.reason });
      continue;
    }
    const r = await readProgram(db, call, opts.model, found.url, c.name, domain, opts.fetch);
    if (!r.ok) {
      await mark(r.reason);
      reports.push({ store: c.store_key, country: c.country, result: r.reason });
      continue;
    }
    const row = { id: programId(c.country, c.store_key), name: r.value.name, provider: c.name.slice(0, 80), summary: r.value.summary, how_to: r.value.how_to, url: found.url, evidence: r.value.evidence, merchants: [c.store_key] };
    if (r.value.hasMoney) {
      const { error: e } = await db.from('perk_candidates').upsert({ ...row, country: c.country, store_key: c.store_key, status: 'review', found_at: new Date().toISOString() }, { onConflict: 'id' });
      if (e) throw new Error(`perk_candidates: ${e.message}`);
      await mark('held for review');
      reports.push({ store: c.store_key, country: c.country, result: 'held for review' });
    } else {
      const { error: e } = await db
        .from('perk_programs')
        .upsert({ ...row, kind: 'free_perk', countries: [c.country], status: 'active', source_url: found.url, last_verified: today, origin: 'scout', sort_order: 900 }, { onConflict: 'id' });
      if (e) throw new Error(`perk_programs: ${e.message}`);
      await mark('published');
      reports.push({ store: c.store_key, country: c.country, result: 'published' });
    }
  }

  // 2. Re-check scouted programs monthly; one the page no longer backs up is hidden.
  const stale = new Date(`${today}T00:00:00Z`);
  stale.setUTCDate(stale.getUTCDate() - RECHECK_DAYS);
  const { data: old } = await db.from('perk_programs').select('id, provider, url, merchants').eq('origin', 'scout').eq('status', 'active').lt('last_verified', stale.toISOString().slice(0, 10)).limit(2);
  for (const p of (old ?? []) as { id: string; provider: string; url: string; merchants: string[] }[]) {
    if (await overBudget()) break;
    const r = await readProgram(db, call, opts.model, p.url, p.provider, new URL(p.url).hostname.replace(/^www\./, ''), opts.fetch);
    const patch = r.ok && !r.value.hasMoney
      ? { summary: r.value.summary, how_to: r.value.how_to, evidence: r.value.evidence, last_verified: today }
      : { status: 'TODO_VERIFY' };
    await db.from('perk_programs').update(patch).eq('id', p.id);
    reports.push({ store: p.merchants[0] ?? p.id, country: '', result: r.ok && !r.value.hasMoney ? 'rechecked' : `hidden: ${r.ok ? 'now states an amount' : r.reason}` });
  }
  return reports;
}
