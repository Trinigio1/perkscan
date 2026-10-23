import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModelCall } from '../inbox/parse.ts';
import { costUsd } from '../inbox/parse.ts';
import { FoundPageSchema, scoutMessage, type Found } from './extract.ts';
import { readPage, type Fetch } from './page.ts';
import { checkFound, type Checked, type SourceIn } from './validate.ts';

// One scout run: the sources due for a check, oldest first. Each page is read, the promotions
// on it extracted, checked against the page (validate.ts) and published straight away — no
// human approval. Items that stop appearing on their page are taken down.

export interface ScoutOptions {
  /** The scout's own monthly cap, separate from email reading. */
  monthlyBudgetUsd: number;
  model: string;
  /** Sources per run; the hourly schedule gets through the list about once a day. */
  maxSources?: number;
  today?: string;
  fetch?: Fetch;
  /** Only these sources (manual runs). */
  only?: string[];
}

export interface SourceReport {
  id: string;
  status: string;
  published?: number;
  dropped?: Record<string, number>;
}

const RECHECK_HOURS = 20;

/** What the scout has spent on AI this month (its usage rows have no user). */
export async function scoutSpendUsd(db: SupabaseClient): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await db.from('ai_usage').select('cost_usd').is('user_id', null).gte('created_at', start.toISOString());
  if (error) throw new Error(`ai_usage: ${error.message}`);
  return (data ?? []).reduce((sum: number, r: { cost_usd: number | string }) => sum + Number(r.cost_usd), 0);
}
/** Gone from the page on two daily checks in a row: take it down. */
const GONE_AFTER_DAYS = 2;

const CURRENCY: Record<string, string> = { US: 'USD', TT: 'TTD', JM: 'JMD', BB: 'BBD', BS: 'BSD', GY: 'GYD' };

const SOURCE_COLUMNS = 'id, name, kind, url, countries, regions, categories, merchants, issuers, card_keywords, last_checked, failures, origin, discovered_users';

/** Pages PerkScan found by itself are dropped after this many failures in a row; hand-picked ones only slow down. */
const DROP_DISCOVERED_AFTER = 5;

/** Which sources to read now: never read, or not for a while; ones that keep failing only weekly. */
export function dueSources<T extends { last_checked: string | null; failures: number; discovered_users?: number | null }>(rows: T[], now: Date, max: number): T[] {
  const hoursSince = (t: string | null) => (t ? (now.getTime() - new Date(t).getTime()) / 3_600_000 : Infinity);
  return rows
    .filter((s) => hoursSince(s.last_checked) >= (s.failures >= 5 ? 24 * 7 : RECHECK_HOURS))
    // Oldest check first; among equals, stores more people use first, so the AI budget goes where it helps most.
    .sort((a, b) => (a.last_checked ?? '').localeCompare(b.last_checked ?? '') || (b.discovered_users ?? 0) - (a.discovered_users ?? 0))
    .slice(0, max);
}

/** The model's reply for a page, or null if it isn't valid. */
export function parseFound(text: string | null): Found[] | null {
  if (!text) return null;
  try {
    const r = FoundPageSchema.safeParse(JSON.parse(text));
    return r.success ? r.data.found.slice(0, 15) : null;
  } catch {
    return null;
  }
}

export function dealRow(s: SourceIn, c: Checked, nowIso: string) {
  return {
    dedupe_key: `official:${s.id}:${c.key}`,
    source: 'official',
    source_id: s.id,
    merchant: s.name.slice(0, 80),
    merchant_keys: s.merchants,
    title: c.title,
    summary: c.summary,
    category: c.category,
    amount: c.amount,
    percent_off: c.percent_off,
    currency: c.currency,
    code: c.code,
    min_spend: c.min_spend,
    countries: s.countries,
    regions: s.regions,
    starts_on: c.starts_on,
    ends_on: c.ends_on,
    url: c.url,
    evidence: c.evidence,
    confidence: c.confidence,
    last_seen: nowIso,
  };
}

export function eventRow(s: SourceIn, c: Checked, today: string) {
  return {
    id: `scout:${s.id}:${c.key}`,
    title: c.title,
    summary: c.summary ?? c.title,
    category: s.kind === 'bank' ? 'bank_promo' : c.event_kind && c.event_kind !== 'bank_promo' ? c.event_kind : 'deadline',
    countries: s.countries,
    regions: s.regions,
    issuers: s.issuers,
    card_keywords: s.card_keywords,
    starts_on: c.starts_on ?? today,
    ends_on: c.ends_on!,
    url: c.url,
    status: 'confirmed',
    based_on: null,
    source_url: s.url,
    last_verified: today,
    source_id: s.id,
    evidence: c.evidence,
    sort_order: 1000,
  };
}

const daysBefore = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
};

export async function runScout(db: SupabaseClient, call: ModelCall, opts: ScoutOptions): Promise<SourceReport[]> {
  const now = new Date();
  const today = opts.today ?? now.toISOString().slice(0, 10);
  let q = db.from('deal_sources').select(SOURCE_COLUMNS).eq('active', true);
  if (opts.only?.length) q = q.in('id', opts.only);
  const { data, error } = await q;
  if (error) throw new Error(`deal_sources: ${error.message}`);
  type Row = SourceIn & { last_checked: string | null; failures: number; origin: 'seed' | 'discovered'; discovered_users: number | null };
  const rows = (data ?? []) as Row[];
  const due = opts.only?.length ? rows : dueSources(rows, now, opts.maxSources ?? 4);

  const reports: SourceReport[] = [];
  for (const s of due) {
    const mark = (patch: Record<string, unknown>) => db.from('deal_sources').update({ last_checked: new Date().toISOString(), ...patch }).eq('id', s.id);
    const failed = (status: string) =>
      mark({ last_status: status, failures: s.failures + 1, ...(s.origin === 'discovered' && s.failures + 1 >= DROP_DISCOVERED_AFTER ? { active: false } : {}) });

    if ((await scoutSpendUsd(db)) >= opts.monthlyBudgetUsd) {
      reports.push({ id: s.id, status: 'budget' });
      break;
    }

    const page = await readPage(s.url, opts.fetch);
    if (!page.ok) {
      await failed(page.error);
      reports.push({ id: s.id, status: page.error });
      continue;
    }

    const input = scoutMessage({ sourceName: s.name, kind: s.kind, country: s.countries.join(', '), today, text: page.text });
    let found: Found[] | null = null;
    for (let attempt = 0; attempt < 2 && found === null; attempt++) {
      let res: Awaited<ReturnType<ModelCall>>;
      try {
        res = await call(input);
      } catch {
        break;
      }
      await db.from('ai_usage').insert({ user_id: null, model: opts.model, input_tokens: res.inputTokens, output_tokens: res.outputTokens, cost_usd: costUsd(res) });
      if (res.stopReason === 'refusal') break;
      found = parseFound(res.text);
    }
    if (found === null) {
      await failed('could not read the promotions');
      reports.push({ id: s.id, status: 'extract failed' });
      continue;
    }

    const dropped: Record<string, number> = {};
    const kept: Checked[] = [];
    const seen = new Set<string>();
    for (const f of found) {
      const r = checkFound(f, { page: page.text, source: s, today, defaultCurrency: s.countries.length === 1 ? (CURRENCY[s.countries[0]!] ?? null) : null });
      if (!r.ok) dropped[r.reason] = (dropped[r.reason] ?? 0) + 1;
      else if (!seen.has(r.value.key)) {
        seen.add(r.value.key);
        kept.push(r.value);
      }
    }

    const nowIso = new Date().toISOString();
    if (s.kind === 'store') {
      if (kept.length) {
        const { error: upErr } = await db.from('deals').upsert(kept.map((c) => dealRow(s, c, nowIso)), { onConflict: 'dedupe_key' });
        if (upErr) throw new Error(`deals: ${upErr.message}`);
      }
      await db.from('deals').delete().eq('source_id', s.id).eq('source', 'official').lt('last_seen', new Date(now.getTime() - GONE_AFTER_DAYS * 86_400_000).toISOString());
    } else {
      if (kept.length) {
        const { error: upErr } = await db.from('local_events').upsert(kept.map((c) => eventRow(s, c, today)), { onConflict: 'id' });
        if (upErr) throw new Error(`local_events: ${upErr.message}`);
      }
      await db.from('local_events').delete().eq('source_id', s.id).lt('last_verified', daysBefore(today, GONE_AFTER_DAYS));
    }

    await mark({ last_status: 'ok', last_found: kept.length, failures: 0 });
    reports.push({ id: s.id, status: 'ok', published: kept.length, dropped });
  }
  return reports;
}
