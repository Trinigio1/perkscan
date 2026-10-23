import { bestPromoUrl, findPromoPage, sitemapLocs } from '../discover.ts';

const html = (body: string) => `<html><body><h1>Store</h1><p>${body}</p></body></html>`;
const PROMO = html('Weekend deals: save 20% off fridges. Special offer on TVs. Free delivery this week on all sale items, see the in-store promo.');

function site(pages: Record<string, { body: string; type?: string; status?: number }>) {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const p = pages[url];
    const r = new Response(p?.body ?? 'not found', { status: p ? (p.status ?? 200) : 404, headers: { 'content-type': p?.type ?? 'text/html' } });
    Object.defineProperty(r, 'url', { value: url });
    return r;
  };
  return { f, calls };
}

describe('sitemapLocs', () => {
  it('reads pages, and child sitemaps from an index', () => {
    expect(sitemapLocs('<urlset><url><loc>https://s.example/a</loc></url><url><loc> https://s.example/b?x=1&amp;y=2 </loc></url></urlset>').pages).toEqual(['https://s.example/a', 'https://s.example/b?x=1&y=2']);
    expect(sitemapLocs('<sitemapindex><sitemap><loc>https://s.example/pages.xml</loc></sitemap></sitemapindex>')).toEqual({ pages: [], sitemaps: ['https://s.example/pages.xml'] });
  });
});

describe('bestPromoUrl', () => {
  it('prefers a short, clearly named promotions page on the store’s own site', () => {
    const urls = [
      'https://www.store.example/p/fridge-sale-12345',
      'https://www.store.example/blog/our-big-sale',
      'https://www.store.example/en/about',
      'https://www.store.example/promotions',
      'https://www.store.example/promotions/divali-2026/terms-and-conditions',
      'https://other.example/deals',
    ];
    expect(bestPromoUrl(urls, 'https://www.store.example')).toBe('https://www.store.example/promotions');
  });
  it('finds nothing when no address looks like promotions', () => {
    expect(bestPromoUrl(['https://s.example/about', 'https://s.example/p/deal-123'], 'https://s.example')).toBeNull();
  });
});

describe('findPromoPage', () => {
  it('uses the sitemap the site publishes', async () => {
    const { f } = site({
      'https://www.store.example/robots.txt': { body: 'User-agent: *\nAllow: /\nSitemap: https://www.store.example/sm.xml', type: 'text/plain' },
      'https://www.store.example/sm.xml': { body: '<urlset><url><loc>https://www.store.example/weekly-specials</loc></url><url><loc>https://www.store.example/about</loc></url></urlset>', type: 'application/xml' },
      'https://www.store.example/weekly-specials': { body: PROMO },
    });
    expect(await findPromoPage('store.example', f)).toEqual({ url: 'https://www.store.example/weekly-specials', via: 'sitemap' });
  });

  it('falls back to common addresses', async () => {
    const { f } = site({
      'https://www.store.example/robots.txt': { body: 'User-agent: *\nAllow: /', type: 'text/plain' },
      'https://www.store.example/deals': { body: PROMO },
    });
    expect(await findPromoPage('store.example', f)).toEqual({ url: 'https://www.store.example/deals', via: 'common path' });
  });

  it('respects robots.txt and stops', async () => {
    const { f, calls } = site({ 'https://www.store.example/robots.txt': { body: 'User-agent: *\nDisallow: /', type: 'text/plain' } });
    expect(await findPromoPage('store.example', f)).toEqual({ url: null, reason: 'robots.txt disallows the site' });
    expect(calls).toEqual(['https://www.store.example/robots.txt']);
  });

  it('skips pages that don’t look like promotions', async () => {
    const { f } = site({
      'https://www.store.example/robots.txt': { body: 'User-agent: *\nAllow: /', type: 'text/plain' },
      'https://www.store.example/deals': { body: html('Our company history and opening hours. Visit our branches across the country for more information about us.') },
    });
    expect(await findPromoPage('store.example', f)).toEqual({ url: null, reason: 'no promotions page found' });
  });
});
