import { htmlToText } from '../inbox/clean.ts';

// Reads one official page politely: https only, robots.txt respected, size and time capped,
// and only the host the source was registered with.

export const USER_AGENT = 'PerkScanBot/1.0 (deal and promotion checker)';
/** Enough for a promotions page; the model sees at most this much text. */
export const MAX_PAGE_CHARS = 30_000;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 15_000;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type PageResult = { ok: true; text: string; finalUrl: string } | { ok: false; error: string };

/** True when robots.txt lets a bot with our name read this path. A simple, conservative reading of the standard. */
export function robotsAllows(robots: string, path: string, agent = 'perkscanbot'): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === 'allow', path: value });
      else if (key === 'disallow') current.rules.push({ allow: true, path: '/' }); // "Disallow:" (empty) allows all
    } else {
      lastWasAgent = false;
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
  // Longest matching rule wins; Allow wins a tie.
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    const pattern = new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    if (!pattern.test(path)) continue;
    if (!best || r.path.length > best.len || (r.path.length === best.len && r.allow)) best = { allow: r.allow, len: r.path.length };
  }
  return best ? best.allow : true;
}

/** "www.courts.co.tt" and "courts.co.tt" are the same site; anything else is not. */
export function sameSite(a: string, b: string): boolean {
  const host = (u: string) => {
    try {
      return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return null;
    }
  };
  const ha = host(a);
  const hb = host(b);
  return !!ha && !!hb && (ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`));
}

async function get(fetchImpl: Fetch, url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9' }, redirect: 'follow', signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches a source page as plain text, or says why it couldn't. */
export async function readPage(url: string, fetchImpl: Fetch = fetch): Promise<PageResult> {
  if (!/^https:\/\//i.test(url)) return { ok: false, error: 'not https' };
  try {
    const origin = new URL(url).origin;
    const robots = await get(fetchImpl, `${origin}/robots.txt`).catch(() => null);
    if (robots?.ok) {
      const u = new URL(url);
      if (!robotsAllows(await robots.text(), `${u.pathname}${u.search}`)) return { ok: false, error: 'robots.txt disallows' };
    }
    const res = await get(fetchImpl, url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const finalUrl = res.url || url;
    if (!finalUrl.startsWith('https://') || !sameSite(finalUrl, url)) return { ok: false, error: 'redirected off site' };
    const type = res.headers.get('content-type') ?? '';
    if (type && !/text\/(html|plain)|application\/xhtml/i.test(type)) return { ok: false, error: `not a page (${type})` };
    const body = await res.text();
    if (body.length > MAX_BYTES) return { ok: false, error: 'page too large' };
    const text = pageText(body);
    if (text.length < 80) return { ok: false, error: 'page has no readable text (may need JavaScript)' };
    return { ok: true, text, finalUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'fetch failed' };
  }
}

/** Page HTML to compact text, links kept as "[label](url)" so the model can point to a deal's own page. */
export function pageText(html: string): string {
  const withLinks = html.replace(/<a\s[^>]*href=["'](https:\/\/[^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    const label = htmlToText(inner).replace(/\s+/g, ' ').trim();
    return label ? ` ${label} (${href}) ` : ' ';
  });
  const text = htmlToText(withLinks)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return text.length > MAX_PAGE_CHARS ? text.slice(0, MAX_PAGE_CHARS) : text;
}
