import type { SupabaseClient } from '@supabase/supabase-js';
import type { Fetch } from '../scout/page.ts';

// Product recalls from the U.S. Consumer Product Safety Commission's public recalls web service, fetched
// once a day by the scout and stored as public reading. The app matches them against each person's own
// receipts on their phone, so nobody's purchases leave it.

export const CPSC_URL = 'https://www.saferproducts.gov/RestWebServices/Recall';
const TIMEOUT_MS = 20_000;
/** Read once a day; on the first run, the last 18 months. */
const REFETCH_HOURS = 20;
const FIRST_DAYS = 548;

export interface RecallRow {
  id: string;
  recall_number: string | null;
  recall_date: string;
  title: string;
  url: string;
  products: { name: string; model: string | null }[];
  manufacturers: string[];
  remedies: string[];
}

const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);

/** What the maker offers, in one word each: Refund, Replace, Repair (from the remedy options, or the remedy text). */
function remediesOf(r: Record<string, unknown>): string[] {
  const words = new Set<string>();
  for (const o of list(r.RemedyOptions)) {
    const t = text(o.Option, 60);
    if (t) words.add(t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  }
  if (!words.size) {
    const all = list(r.Remedies).map((x) => text(x.Name, 600)).join(' ');
    for (const [re, w] of [[/refund/i, 'Refund'], [/replace/i, 'Replace'], [/repair/i, 'Repair']] as const) if (re.test(all)) words.add(w);
  }
  return [...words].slice(0, 4);
}

/** The web service's JSON to rows; anything without an id, a date, a title or an https link is skipped. */
export function parseRecalls(json: unknown): RecallRow[] {
  const out: RecallRow[] = [];
  for (const r of list(json)) {
    const id = r.RecallID === undefined || r.RecallID === null ? '' : String(r.RecallID);
    const date = text(r.RecallDate, 40).slice(0, 10);
    const title = text(r.Title, 300);
    const url = text(r.URL, 500);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title || !/^https:\/\//.test(url)) continue;
    out.push({
      id,
      recall_number: text(r.RecallNumber, 40) || null,
      recall_date: date,
      title,
      url,
      products: list(r.Products)
        .map((p) => ({ name: text(p.Name), model: text(p.Model) || null }))
        .filter((p) => p.name)
        .slice(0, 10),
      manufacturers: list(r.Manufacturers).map((m) => text(m.Name, 120)).filter(Boolean).slice(0, 5),
      remedies: remediesOf(r),
    });
  }
  return out;
}

/** Recalls announced since a date. */
export async function fetchRecalls(since: string, fetchImpl: Fetch = fetch): Promise<RecallRow[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${CPSC_URL}?format=json&RecallDateStart=${since}`, { headers: { Accept: 'application/json', 'User-Agent': 'PerkScanBot/1.0 (recall checker)' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`CPSC HTTP ${res.status}`);
    return parseRecalls(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Once a day: new recalls since the last one stored (a week back, for late publications). */
export async function runRecallFetch(db: SupabaseClient, opts: { fetch?: Fetch; now?: Date } = {}): Promise<{ fetched: number } | { skipped: string }> {
  const now = opts.now ?? new Date();
  const { data: latest, error } = await db.from('product_recalls').select('recall_date, fetched_at').order('fetched_at', { ascending: false }).limit(1);
  if (error) throw new Error(`product_recalls: ${error.message}`);
  const last = (latest ?? [])[0] as { recall_date: string; fetched_at: string } | undefined;
  if (last && now.getTime() - new Date(last.fetched_at).getTime() < REFETCH_HOURS * 3_600_000) return { skipped: 'fetched today' };
  const { data: newest } = await db.from('product_recalls').select('recall_date').order('recall_date', { ascending: false }).limit(1);
  const top = ((newest ?? [])[0] as { recall_date: string } | undefined)?.recall_date;
  const since = new Date((top ? new Date(`${top}T00:00:00Z`).getTime() - 7 * 86_400_000 : now.getTime() - FIRST_DAYS * 86_400_000)).toISOString().slice(0, 10);
  const rows = await fetchRecalls(since, opts.fetch);
  const stamp = now.toISOString();
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e } = await db.from('product_recalls').upsert(rows.slice(i, i + 200).map((r) => ({ ...r, fetched_at: stamp })), { onConflict: 'id' });
    if (e) throw new Error(`product_recalls: ${e.message}`);
  }
  // Even with nothing new, remember that today's check happened.
  if (!rows.length && last) await db.from('product_recalls').update({ fetched_at: stamp }).eq('recall_date', last.recall_date);
  return { fetched: rows.length };
}
