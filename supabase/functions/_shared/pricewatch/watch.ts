import { sameMerchant } from '../merchant.ts';

// Real price drops on things you bought. Stores with a price-adjustment policy (Target 14 days, Costco 30,
// Macy's 10, Best Buy during the return period) refund the difference if the price falls. PerkScan keeps
// the direct product links from your receipt (the store's own product pages, tracking removed), checks the
// price the store publishes on that page once a day while the window is open, and tells you when it drops.
// Pure helpers here; the runner fetches pages politely and writes the result.

/** Stores whose receipts carry product links PerkScan can check, and what their product pages look like. */
export const WATCHED_STORES: { domain: string; product: RegExp; keepParams?: string[] }[] = [
  { domain: 'target.com', product: /^\/p\/[^?#]*\/-\/A-\d+/i },
  { domain: 'bestbuy.com', product: /^\/site\/[^?#]+\/\d+\.p/i },
  { domain: 'costco.com', product: /\.product\.\d+\.html$/i },
  { domain: 'macys.com', product: /^\/shop\/product\//i, keepParams: ['ID'] },
];

const hostOf = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, '');

/**
 * Direct product links on a watched store's own site, from an email's text or HTML: tracking parameters
 * removed (only what identifies the product stays), at most 10. Redirect/tracking links aren't followed.
 */
export function productLinks(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(/https:\/\/[^\s"'<>)\]]+/gi)) {
    let u: URL;
    try {
      u = new URL(m[0].replace(/&amp;/g, '&'));
    } catch {
      continue;
    }
    const store = WATCHED_STORES.find((s) => hostOf(u) === s.domain || hostOf(u).endsWith(`.${s.domain}`));
    if (!store || !store.product.test(u.pathname)) continue;
    const keep = new URLSearchParams();
    for (const k of store.keepParams ?? []) {
      const v = u.searchParams.get(k);
      if (v && /^[\w-]{1,40}$/.test(v)) keep.set(k, v);
    }
    const q = keep.toString();
    out.add(`https://www.${store.domain}${u.pathname}${q ? `?${q}` : ''}`);
    if (out.size >= 10) break;
  }
  return [...out];
}

/** The current price a product page publishes in its structured data (JSON-LD, or price meta tags). */
export function priceFromHtml(html: string): { price: number; currency: string | null } | null {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!.trim());
    } catch {
      continue;
    }
    const found = findOffer(data);
    if (found) return found;
  }
  const meta = (name: string) => new RegExp(`<meta[^>]+(?:property|itemprop|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html)?.[1] ??
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|itemprop|name)=["']${name}["']`, 'i').exec(html)?.[1];
  const amount = Number(meta('product:price:amount') ?? meta('og:price:amount') ?? meta('price'));
  if (amount > 0) return { price: amount, currency: meta('product:price:currency') ?? meta('og:price:currency') ?? meta('priceCurrency') ?? null };
  return null;
}

function findOffer(x: unknown): { price: number; currency: string | null } | null {
  if (Array.isArray(x)) {
    for (const y of x) {
      const f = findOffer(y);
      if (f) return f;
    }
    return null;
  }
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (o['@graph']) return findOffer(o['@graph']);
  const type = [o['@type']].flat().map(String);
  if (type.includes('Product') && o.offers) return findOffer(o.offers);
  if (type.some((t) => /Offer$/.test(t))) {
    const price = Number(o.price ?? o.lowPrice);
    if (price > 0) return { price, currency: typeof o.priceCurrency === 'string' ? o.priceCurrency : null };
  }
  return null;
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));

/** Which receipt item a product link is for: the one whose name shares most words with the link, or the only item. */
export function itemForLink<T extends { name: string }>(items: T[], url: string): T | null {
  if (items.length === 1) return items[0]!;
  const slug = words(decodeURIComponent(new URL(url).pathname));
  let best: { item: T; n: number } | null = null;
  for (const it of items) {
    const n = [...words(it.name)].filter((w) => slug.has(w)).length;
    if (n >= 2 && (!best || n > best.n)) best = { item: it, n };
  }
  return best?.item ?? null;
}

/** A drop worth asking for: at least $1 and 3% below what you paid. */
export function priceDrop(paid: number, now: number): number | null {
  const diff = Math.round((paid - now) * 100) / 100;
  return diff >= 1 && diff >= paid * 0.03 ? diff : null;
}

export interface WatchProgram {
  id: string;
  merchants: string[];
  /** Days after purchase; null = during the return period (use return_by). */
  window_days: number | null;
  how_to: string;
  url: string;
}

/** The last day a price drop can still be claimed for this purchase, or null when the store has no policy. */
export function claimUntil(merchant: string, purchaseDate: string, returnBy: string | null, programs: WatchProgram[]): { program: WatchProgram; until: string } | null {
  const program = programs.find((p) => p.merchants.some((m) => sameMerchant(m, merchant)));
  if (!program) return null;
  if (program.window_days === null) return returnBy ? { program, until: returnBy } : null;
  const t = new Date(`${purchaseDate}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + program.window_days);
  return { program, until: t.toISOString().slice(0, 10) };
}
