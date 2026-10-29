import { claimUntil, itemForLink, priceDrop, priceFromHtml, productLinks } from '../watch.ts';

describe('productLinks', () => {
  it('keeps direct product pages on stores with price-adjustment policies, without tracking', () => {
    const email = `
      Dyson V8 https://www.target.com/p/dyson-v8-cordless-vacuum/-/A-12345678?ref=email&utm_source=x
      https://click.target.com/redirect?u=abc (tracking: not followed)
      Sony headphones https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p?skuId=6505727&cmp=RMX
      <a href="https://www.macys.com/shop/product/coat?ID=1234567&amp;cm_mmc=email">Coat</a>
      https://www.costco.com/kirkland-towels.product.100345.html?EMID=xyz
      https://www.amazon.com/dp/B000 (not a price-adjustment store)`;
    expect(productLinks(email)).toEqual([
      'https://www.target.com/p/dyson-v8-cordless-vacuum/-/A-12345678',
      'https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p',
      'https://www.macys.com/shop/product/coat?ID=1234567',
      'https://www.costco.com/kirkland-towels.product.100345.html',
    ]);
  });
});

describe('priceFromHtml', () => {
  it('reads the price the store publishes on the page', () => {
    const ld = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Dyson V8","offers":{"@type":"Offer","price":"329.99","priceCurrency":"USD"}}</script>`;
    expect(priceFromHtml(`<html>${ld}</html>`)).toEqual({ price: 329.99, currency: 'USD' });
    const graph = `<script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"},{"@type":"Product","offers":[{"@type":"AggregateOffer","lowPrice":89,"priceCurrency":"USD"}]}]}</script>`;
    expect(priceFromHtml(graph)).toEqual({ price: 89, currency: 'USD' });
    expect(priceFromHtml('<meta property="product:price:amount" content="19.50"><meta property="product:price:currency" content="USD">')).toEqual({ price: 19.5, currency: 'USD' });
    expect(priceFromHtml('<html>no price here</html>')).toBeNull();
  });
});

describe('matching a link to a receipt item', () => {
  const items = [{ name: 'Dyson V8 Cordless Vacuum' }, { name: 'Kirkland Bath Towels' }];
  it('by shared words, or the only item', () => {
    expect(itemForLink(items, 'https://www.target.com/p/dyson-v8-cordless-vacuum/-/A-12345678')).toBe(items[0]);
    expect(itemForLink([items[1]!], 'https://www.target.com/p/x/-/A-1')).toBe(items[1]);
    expect(itemForLink(items, 'https://www.target.com/p/lamp/-/A-1')).toBeNull();
  });
});

describe('priceDrop', () => {
  it('only counts a drop of at least $1 and 3%', () => {
    expect(priceDrop(399.99, 329.99)).toBe(70);
    expect(priceDrop(20, 19.5)).toBeNull();
    expect(priceDrop(100, 101)).toBeNull();
  });
});

describe('claimUntil', () => {
  const programs = [
    { id: 'target_price_match', merchants: ['target'], window_days: 14, how_to: 'Bring the receipt.', url: 'https://www.target.com/help' },
    { id: 'best_buy_price_match', merchants: ['best buy', 'bestbuy'], window_days: null, how_to: 'Chat or call.', url: 'https://www.bestbuy.com/help' },
  ];
  it('uses the store’s window, or its return period', () => {
    expect(claimUntil('Target', '2026-10-20', null, programs)?.until).toBe('2026-11-03');
    expect(claimUntil('Best Buy', '2026-10-20', '2026-11-04', programs)?.until).toBe('2026-11-04');
    expect(claimUntil('Best Buy', '2026-10-20', null, programs)).toBeNull();
    expect(claimUntil('Amazon', '2026-10-20', null, programs)).toBeNull();
  });
});
