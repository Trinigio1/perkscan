import type { SupabaseClient } from '@supabase/supabase-js';
import { readPage, robotsAllows, sameSite, USER_AGENT, type Fetch } from './page.ts';

// Grows the list of store pages by itself, at no cost beyond reading pages: stores that email
// several PerkScan users in a country are looked up on their own website — the sitemap their
// robots.txt points to, or common addresses like /promotions — and a promotions page found
// there joins the list. The scout then reads it like any other page, with the same checks.

/** Words in a page address that suggest promotions. */
const PROMO_PATH = /(promo|promotion|deal|offer|special|sale|coupon|saving|weekly-ad|flyer|circular|discount)/i;
/** Addresses that are products or articles, not a promotions page. */
const NOT_A_LISTING = /(\/p\/|\/product|\/item|\/blog|\/news|\/press|\/career|\/job|terms|condition|privacy|faq|\.pdf$|\.jpg$|\.png$)/i;
const COMMON_PATHS = ['/promotions', '/deals', '/offers', '/specials', '/weekly-specials', '/sale', '/coupons', '/savings'];
/** A promotions page should say so more than once. */
const PROMO_WORDS = /(% off|\boff\b|\bsave\b|\bsale\b|\bdeal|\boffer|\bpromo|\bspecial|cash ?back|\bfree\b)/gi;

const MAX_SITEMAP_BYTES = 3_000_000;
const MAX_ACTIVE_PER_COUNTRY = 40;

/** Page addresses listed in a sitemap (or a sitemap index). */
export function sitemapLocs(xml: string): { pages: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, '&'));
  return /<sitemapindex/i.test(xml) ? { pages: [], sitemaps: locs } : { pages: locs, sitemaps: [] };
}

/** The best-looking promotions page among a site's addresses, or null. Short, top-level, clearly named wins. */
export function bestPromoUrl(urls: string[], site: string): string | null {
  const scored = urls
    .filter((u) => u.startsWith('https://') && sameSite(u, site))
    .map((u) => {
      let path: string;
      try {
        path = new URL(u).pathname.toLowerCase();
      } catch {
        return null;
      }
      if (!PROMO_PATH.test(path) || NOT_A_LISTING.test(path)) return null;
      const depth = path.split('/').filter(Boolean).length;
      const named = /\/(promotions?|deals|offers|specials|weekly-specials|weekly-ad|coupons|savings)\/?$/.test(path) ? 10 : 0;
      return { u, score: named - depth * 2 - path.length / 40 };
    })
    .filter((x): x is { u: string; score: number } => !!x)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.u ?? null;
}

async function getText(fetchImpl: Fetch, url: string, maxBytes: number): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > maxBytes ? null : text;
  } catch {
    return null;
  }
}

export type FindResult = { url: string; via: 'sitemap' | 'common path' } | { url: null; reason: string };

/** Looks for a store's promotions page on its own website. */
export async function findPromoPage(domain: string, fetchImpl: Fetch = fetch): Promise<FindResult> {
  for (const origin of [`https://www.${domain}`, `https://${domain}`]) {
    const robots = await getText(fetchImpl, `${origin}/robots.txt`, 500_000);
    if (robots !== null && !robotsAllows(robots, '/')) return { url: null, reason: 'robots.txt disallows the site' };

    // 1. The sitemap the site itself publishes.
    const maps = robots ? [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]!) : [];
    if (!maps.length) maps.push(`${origin}/sitemap.xml`);
    const pages: string[] = [];
    for (const map of maps.slice(0, 3)) {
      const xml = await getText(fetchImpl, map, MAX_SITEMAP_BYTES);
      if (!xml) continue;
      const { pages: p, sitemaps } = sitemapLocs(xml);
      pages.push(...p);
      // An index: follow the few child sitemaps most likely to list pages rather than products.
      const children = [...sitemaps].sort((a, b) => Number(/page|cms|content|promo|main/i.test(b)) - Number(/page|cms|content|promo|main/i.test(a))).slice(0, 3);
      for (const child of children) {
        const sub = await getText(fetchImpl, child, MAX_SITEMAP_BYTES);
        if (sub) pages.push(...sitemapLocs(sub).pages);
      }
    }
    const fromMap = bestPromoUrl(pages, origin);
    if (fromMap && robotsAllows(robots ?? '', new URL(fromMap).pathname) && (await looksLikePromotions(fromMap, fetchImpl))) {
      return { url: fromMap, via: 'sitemap' };
    }

    // 2. Common addresses.
    for (const path of COMMON_PATHS) {
      if (robots !== null && !robotsAllows(robots, path)) continue;
      if (await looksLikePromotions(`${origin}${path}`, fetchImpl)) return { url: `${origin}${path}`, via: 'common path' };
    }
    if (robots !== null) break; // the site answered; no need to try the other origin
  }
  return { url: null, reason: 'no promotions page found' };
}

async function looksLikePromotions(url: string, fetchImpl: Fetch): Promise<boolean> {
  const page = await readPage(url, fetchImpl);
  return page.ok && (page.text.match(PROMO_WORDS)?.length ?? 0) >= 3;
}

export interface DiscoverReport {
  domain: string;
  country: string;
  result: string;
}

/**
 * Official sites of well-known stores and restaurants, by store key, for store names that reach
 * PerkScan without a domain of their own (a Chipotle order through Uber Eats, a card alert).
 */
export const KNOWN_DOMAINS: Record<string, string> = {
  chipotle: 'chipotle.com', sweetgreen: 'sweetgreen.com', starbucks: 'starbucks.com', mcdonalds: 'mcdonalds.com', dominos: 'dominos.com',
  panerabread: 'panerabread.com', panera: 'panerabread.com', dunkin: 'dunkindonuts.com', tacobell: 'tacobell.com', wingstop: 'wingstop.com',
  chickfila: 'chick-fil-a.com', shakeshack: 'shakeshack.com', burgerking: 'bk.com', papajohns: 'papajohns.com', pizzahut: 'pizzahut.com',
  subway: 'subway.com', cava: 'cava.com', wendys: 'wendys.com', popeyes: 'popeyes.com', kfc: 'kfc.com', dennys: 'dennys.com', ihop: 'ihop.com',
  pollotropical: 'pollotropical.com', joethejuice: 'joejuice.com', fiveguys: 'fiveguys.com', pandaexpress: 'pandaexpress.com',
  amazon: 'amazon.com', walmart: 'walmart.com', target: 'target.com', bestbuy: 'bestbuy.com', dell: 'dell.com', nike: 'nike.com',
  sephora: 'sephora.com', ulta: 'ulta.com', cvs: 'cvs.com', walgreens: 'walgreens.com', costco: 'costco.com', homedepot: 'homedepot.com',
  lowes: 'lowes.com', kohls: 'kohls.com', macys: 'macys.com', oldnavy: 'oldnavy.com', gap: 'gap.com', zara: 'zara.com', uniqlo: 'uniqlo.com',
  wholefoods: 'wholefoodsmarket.com', kroger: 'kroger.com', publix: 'publix.com', wayfair: 'wayfair.com', ikea: 'ikea.com',
  newegg: 'newegg.com', samsung: 'samsung.com', lenovo: 'lenovo.com', adidas: 'adidas.com', lululemon: 'lululemon.com', trip: 'trip.com',
};

/** A store key's official domain from KNOWN_DOMAINS: exact, or the store name starting with a known one ("chipotlemexicangrill"). */
export function knownDomain(storeKey: string): string | null {
  const k = Object.keys(KNOWN_DOMAINS).sort((a, b) => b.length - a.length).find((x) => storeKey === x || (x.length >= 4 && storeKey.startsWith(x)));
  return k ? KNOWN_DOMAINS[k]! : null;
}

interface Candidate {
  country: string;
  domain: string;
  store_key: string;
  name: string;
  users: number;
}

/**
 * Stores to look up: first the ones on people's receipts (where they actually buy), then stores that
 * email several users. Store names without a domain are matched to known official sites.
 */
async function candidates(db: SupabaseClient, perRun: number, minUsers: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (c: Candidate) => {
    const k = `${c.country}|${c.domain}`;
    if (!seen.has(k)) seen.add(k) && out.push(c);
  };
  const bought = await db.rpc('_purchase_store_candidates', { p_limit: perRun * 4 });
  if (bought.error) console.warn('_purchase_store_candidates', bought.error.message);
  for (const b of (bought.data ?? []) as { country: string; domain: string | null; store_key: string; name: string; purchases: number }[]) {
    const domain = b.domain ?? knownDomain(b.store_key);
    if (!domain) continue;
    if (!b.domain) {
      // Name-only candidates skip the SQL checks: look them up here.
      const listed = await db.from('deal_sources').select('id', { count: 'exact', head: true }).contains('countries', [b.country]).ilike('url', `%${domain}%`);
      const checked = await db.from('store_domain_checks').select('domain').eq('domain', domain).eq('country', b.country).gt('checked_at', new Date(Date.now() - 30 * 86_400_000).toISOString()).maybeSingle();
      if ((listed.count ?? 0) > 0 || checked.data) continue;
    }
    push({ country: b.country, domain, store_key: b.store_key, name: b.name, users: b.purchases });
  }
  const { data, error } = await db.rpc('_store_candidates', { p_min_users: minUsers, p_limit: perRun });
  if (error) throw new Error(`_store_candidates: ${error.message}`);
  for (const c of (data ?? []) as Candidate[]) push(c);
  return out.slice(0, perRun);
}

/** Looks up a few new stores per run and adds the promotions pages it finds. */
export async function discoverStores(db: SupabaseClient, opts: { fetch?: Fetch; perRun?: number; minUsers?: number } = {}): Promise<DiscoverReport[]> {
  const reports: DiscoverReport[] = [];
  for (const c of await candidates(db, opts.perRun ?? 4, opts.minUsers ?? 3)) {
    const { count } = await db.from('deal_sources').select('id', { count: 'exact', head: true }).eq('origin', 'discovered').eq('active', true).contains('countries', [c.country]);
    if ((count ?? 0) >= MAX_ACTIVE_PER_COUNTRY) {
      reports.push({ domain: c.domain, country: c.country, result: 'list full' });
      break;
    }
    const found = await findPromoPage(c.domain, opts.fetch);
    const result = 'via' in found ? `added (${found.via})` : found.reason;
    await db.from('store_domain_checks').upsert({ domain: c.domain, country: c.country, result, checked_at: new Date().toISOString() }, { onConflict: 'domain,country' });
    if ('via' in found) {
      const { error: insErr } = await db.from('deal_sources').upsert(
        {
          id: `auto_${c.country.toLowerCase()}_${c.domain.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`.slice(0, 60),
          name: c.name.slice(0, 80),
          kind: 'store',
          url: found.url,
          countries: [c.country],
          regions: [],
          categories: [],
          merchants: [c.store_key],
          issuers: [],
          card_keywords: [],
          active: true,
          origin: 'discovered',
          discovered_users: c.users,
        },
        { onConflict: 'id' },
      );
      if (insErr) throw new Error(`deal_sources: ${insErr.message}`);
    }
    reports.push({ domain: c.domain, country: c.country, result });
  }
  return reports;
}
