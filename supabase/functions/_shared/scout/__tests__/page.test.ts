import { pageText, readPage, robotsAllows, sameSite } from '../page.ts';
import { dueSources, parseFound } from '../run.ts';

describe('robotsAllows', () => {
  const robots = `User-agent: *\nDisallow: /checkout\nAllow: /checkout/deals\n\nUser-agent: BadBot\nDisallow: /`;
  it('follows the rules for everyone', () => {
    expect(robotsAllows(robots, '/promotions')).toBe(true);
    expect(robotsAllows(robots, '/checkout/cart')).toBe(false);
    expect(robotsAllows(robots, '/checkout/deals')).toBe(true);
  });
  it('follows rules aimed at us', () => {
    expect(robotsAllows('User-agent: PerkScanBot\nDisallow: /\n\nUser-agent: *\nAllow: /', '/deals')).toBe(false);
  });
  it('allows everything when "Disallow:" is empty', () => {
    expect(robotsAllows('User-agent: *\nDisallow:', '/anything')).toBe(true);
  });
});

describe('sameSite', () => {
  it('treats www and subdomains as the store’s site', () => {
    expect(sameSite('https://www.courts.co.tt/a', 'https://courts.co.tt/b')).toBe(true);
    expect(sameSite('https://shop.courts.co.tt/a', 'https://courts.co.tt/b')).toBe(true);
    expect(sameSite('https://courts.co.tt.evil.example/a', 'https://courts.co.tt/b')).toBe(false);
  });
});

describe('pageText', () => {
  it('keeps text and links, drops scripts', () => {
    const t = pageText('<script>var x=1</script><h1>Deals</h1><p>20% off <a href="https://s.example/d">shoes</a></p>');
    expect(t).toContain('Deals');
    expect(t).toContain('shoes (https://s.example/d)');
    expect(t).not.toContain('var x');
  });
});

describe('readPage', () => {
  const html = `<html><body><h1>Promotions</h1><p>${'Save 20% on all shoes until October 31. '.repeat(5)}</p></body></html>`;
  const res = (body: string, init: ResponseInit & { url?: string } = {}) => {
    const r = new Response(body, { status: 200, headers: { 'content-type': 'text/html' }, ...init });
    Object.defineProperty(r, 'url', { value: init.url ?? '' });
    return r;
  };
  it('reads an allowed page', async () => {
    const f = jest.fn(async (u: string) => (u.endsWith('robots.txt') ? res('User-agent: *\nAllow: /') : res(html, { url: u })));
    const r = await readPage('https://shop.example/promos', f);
    expect(r.ok && r.text).toContain('Save 20%');
  });
  it('respects robots.txt', async () => {
    const f = jest.fn(async (u: string) => (u.endsWith('robots.txt') ? res('User-agent: *\nDisallow: /promos') : res(html)));
    expect(await readPage('https://shop.example/promos', f)).toEqual({ ok: false, error: 'robots.txt disallows' });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('refuses to follow redirects to other sites', async () => {
    const f = jest.fn(async (u: string) => (u.endsWith('robots.txt') ? res('', { status: 404 }) : res(html, { url: 'https://other.example/x' })));
    expect(await readPage('https://shop.example/promos', f)).toEqual({ ok: false, error: 'redirected off site' });
  });
  it('only reads https', async () => {
    expect(await readPage('http://shop.example/promos', jest.fn())).toEqual({ ok: false, error: 'not https' });
  });
});

describe('dueSources', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  it('reads never-checked and stale sources first, failing ones weekly', () => {
    const rows = [
      { id: 'fresh', last_checked: '2026-10-23T06:00:00Z', failures: 0 },
      { id: 'stale', last_checked: '2026-10-22T06:00:00Z', failures: 0 },
      { id: 'new', last_checked: null, failures: 0 },
      { id: 'failing', last_checked: '2026-10-20T12:00:00Z', failures: 6 },
    ];
    expect(dueSources(rows, now, 5).map((r) => r.id)).toEqual(['new', 'stale']);
  });
});

describe('parseFound', () => {
  it('rejects invalid replies', () => {
    expect(parseFound('not json')).toBeNull();
    expect(parseFound('{"found":[{"title":1}]}')).toBeNull();
    expect(parseFound('{"found":[]}')).toEqual([]);
  });
});
