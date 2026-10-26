import { dealValue, domainStoreKey, groupByInterest, interestProfile, matchStore, peopleLikeYou, rankDeals, storeKey, suggestedInterests, type Deal, type DealsFor, type InterestInput } from '../deals';

const TODAY = '2026-10-23';
const deal = (d: Partial<Deal> & { id: string }): Deal => ({
  source: 'official', merchant: d.id, merchant_keys: [], title: d.id, summary: null, category: 'shopping', amount: null, percent_off: null,
  currency: null, code: null, min_spend: null, countries: ['TT'], regions: [], starts_on: null, ends_on: null, url: 'https://x.example',
  evidence: 'x', confidence: 'confirmed', seen_by: 0, saves: 0, ...d,
});
const opp = (o: Partial<InterestInput['opportunities'][number]>) => ({ merchant: null, code: null, type: 'promo' as const, dedupe_key: null, value_estimate: null, source_message_id: null, ...o });

const input: InterestInput = {
  picked: ['fitness'],
  receipts: [
    { merchant: 'COURTS (TRINIDAD) LTD', purchase_type: 'appliance' },
    { merchant: 'Uber Eats', purchase_type: 'food_delivery' },
    { merchant: 'Uber Eats', purchase_type: 'food_delivery' },
    { merchant: 'Massy Stores', purchase_type: 'groceries' },
  ],
  opportunities: [
    // Massy emails you its promotions.
    opp({ merchant: 'Massy Stores', code: 'MASSY10', value_estimate: 10, source_message_id: 'm1' }),
  ],
  senderDomains: ['pricesmart.com', 'gmail.com'],
};
const profile = interestProfile(input);
const who = (over: Partial<DealsFor> = {}): DealsFor => ({ country: 'TT', today: TODAY, profile, feedback: [], ...over });

describe('store names', () => {
  it('reads the same store the same way everywhere', () => {
    expect(storeKey('COURTS (TRINIDAD) LTD')).toBe('courts');
    expect(domainStoreKey('email.courts.co.tt')).toBe('courts');
    expect(domainStoreKey('courts.co.tt')).toBe('courts');
    expect(domainStoreKey('mail.target.com')).toBe('target');
    expect(domainStoreKey('my.uwi.edu')).toBeNull();
  });
});

describe('interestProfile', () => {
  it('separates stores you shop at from stores that email you', () => {
    expect([...profile.shops]).toEqual(['courts', 'ubereats', 'massystores']);
    expect(profile.follows.has('pricesmart')).toBe(true);
    expect(profile.follows.has('massystores')).toBe(true);
    expect(profile.follows.has('courts')).toBe(false);
    expect(profile.inferred.get('delivery')).toBe(2);
    expect(suggestedInterests(profile)).toEqual(['delivery', 'home', 'groceries']);
  });
});

describe('matchStore', () => {
  it('matches a store however its name is written', () => {
    expect(matchStore({ merchant: 'Courts', merchant_keys: ['courts'] }, profile.shops)).toBe('courts');
    expect(matchStore({ merchant: 'Nike', merchant_keys: ['nike'] }, profile.shops)).toBeNull();
  });
});

describe('rankDeals: what your inbox won’t show you', () => {
  const deals = [
    deal({ id: 'courts', merchant: 'Courts', merchant_keys: ['courts'], category: 'home', amount: 300 }),
    deal({ id: 'gym', category: 'fitness', percent_off: 20 }),
    deal({ id: 'pizza', merchant: 'Pizza Boys', category: 'delivery', amount: 25 }),
    deal({ id: 'pricesmart', merchant: 'PriceSmart', merchant_keys: ['pricesmart'], category: 'electronics', percent_off: 15 }),
    deal({ id: 'massy_same', merchant: 'Massy Stores', merchant_keys: ['massystores'], category: 'groceries', code: 'MASSY10', amount: 10 }),
    deal({ id: 'zara', category: 'fashion', percent_off: 40 }),
    deal({ id: 'us_only', countries: ['US'], category: 'home' }),
    deal({ id: 'ended', category: 'home', ends_on: '2026-10-20' }),
    deal({ id: 'florida', regions: ['FL'], category: 'home' }),
  ];

  it('raises stores you shop at that don’t email you, then interests, then spending', () => {
    const r = rankDeals(deals, who());
    expect(r.forYou.map((x) => [x.deal.id, x.why])).toEqual([
      ['courts', 'You shop at Courts'],
      ['gym', 'Matches Fitness'],
      ['pizza', 'You spend on food delivery'],
    ]);
  });

  it('never repeats a deal already in your Money, and leaves out stores that email you', () => {
    const ids = [...rankDeals(deals, who()).forYou, ...rankDeals(deals, who()).popular].map((x) => x.deal.id);
    expect(ids).not.toContain('massy_same');
    expect(ids).not.toContain('pricesmart');
    expect(rankDeals(deals, who()).popular.map((x) => [x.deal.id, x.why])).toEqual([['zara', null]]);
  });

  it('tags each deal with what it’s about, not just its category', () => {
    const r = rankDeals([deal({ id: 'nike', merchant: 'Nike', category: 'fashion', percent_off: 25 }), deal({ id: 'yoga', merchant: 'Corner Studio', title: 'First yoga class free' })], who());
    expect(r.forYou.map((x) => [x.deal.id, x.tags, x.why])).toEqual([
      ['nike', ['fashion', 'fitness'], 'Matches Fitness'],
      ['yoga', ['fitness'], 'Matches Fitness'],
    ]);
  });

  it('still shows an emailing store’s deal when it matches you strongly', () => {
    const r = rankDeals([deal({ id: 'ps_fit', merchant: 'PriceSmart', merchant_keys: ['pricesmart'], category: 'fitness' })], who());
    expect(r.forYou.map((x) => x.deal.id)).toEqual(['ps_fit']);
    expect(r.forYou[0]!.score).toBeLessThan(rankDeals([deal({ id: 'other_fit', category: 'fitness' })], who()).forYou[0]!.score);
  });

  it('keeps deals you saved, shown as saved', () => {
    const p = interestProfile({ ...input, opportunities: [...input.opportunities, opp({ merchant: 'Courts', code: 'COOL300', value_estimate: 300, dedupe_key: 'deal:confirmed:courts' })] });
    const r = rankDeals([deal({ id: 'courts', merchant: 'Courts', merchant_keys: ['courts'], category: 'home', amount: 300, code: 'COOL300' })], who({ profile: p }));
    expect(r.forYou.map((x) => x.deal.id)).toEqual(['courts']);
  });

  it('only shows deals where you live, that haven’t ended', () => {
    const ids = [...rankDeals(deals, who()).forYou, ...rankDeals(deals, who()).popular].map((x) => x.deal.id);
    expect(ids).not.toContain('us_only');
    expect(ids).not.toContain('ended');
    expect(ids).not.toContain('florida');
    expect(rankDeals(deals, who({ country: null })).forYou).toEqual([]);
  });

  it('hides what you dismissed or said didn’t work, and cools on that store', () => {
    const more = [...deals, deal({ id: 'courts2', merchant: 'Courts', merchant_keys: ['courts'], category: 'home', amount: 50 })];
    const r = rankDeals(more, who({ feedback: [{ deal_id: 'courts', action: 'dismissed' }, { deal_id: 'gym', action: 'didnt_work' }] }));
    const ids = r.forYou.map((x) => x.deal.id);
    expect(ids).not.toContain('courts');
    expect(ids).not.toContain('gym');
    expect(r.forYou.find((x) => x.deal.id === 'courts2')!.score).toBeLessThan(rankDeals(more, who()).forYou.find((x) => x.deal.id === 'courts2')!.score);
  });

  it('breaks ties by urgency, confidence and popularity', () => {
    const r = rankDeals(
      [
        deal({ id: 'later', category: 'fitness', ends_on: '2026-12-01' }),
        deal({ id: 'soon', category: 'fitness', ends_on: '2026-10-25' }),
        deal({ id: 'unsure', category: 'fitness', confidence: 'check', ends_on: '2026-12-01' }),
      ],
      who(),
    );
    expect(r.forYou.map((x) => x.deal.id)).toEqual(['soon', 'later', 'unsure']);
  });
});

describe('people like you', () => {
  const likeYou = peopleLikeYou(
    profile,
    [{ store_key: 'ubereats', people: 20 }, { store_key: 'courts', people: 10 }],
    [
      { store_a: 'ubereats', store_b: 'foodrop', people: 12 },
      { store_a: 'courts', store_b: 'foodrop', people: 3 },
      { store_a: 'ubereats', store_b: 'tinyshop', people: 2 },
      { store_a: 'ubereats', store_b: 'courts', people: 9 },
    ],
  );

  it('finds stores popular with people who shop where you do, but not ones you use', () => {
    expect(likeYou.get('foodrop')).toEqual({ via: 'Uber Eats', share: 0.6 });
    expect(likeYou.has('courts')).toBe(false);
  });

  it('raises their deals, and says why', () => {
    const r = rankDeals([deal({ id: 'foodrop', merchant: 'FooDrop', merchant_keys: ['foodrop'], category: 'shopping' })], who({ likeYou }));
    expect(r.forYou.map((x) => x.why)).toEqual(['Popular with people who use Uber Eats']);
  });

  it('ignores weak links', () => {
    const r = rankDeals([deal({ id: 'tinyshop', merchant: 'Tiny Shop', merchant_keys: ['tinyshop'], category: 'shopping' })], who({ likeYou }));
    expect(r.forYou).toEqual([]);
    expect(r.popular.map((x) => x.deal.id)).toEqual(['tinyshop']);
  });
});

describe('dealValue', () => {
  it('shows only stated numbers', () => {
    const fmt = (n: number) => `TT$${n}`;
    expect(dealValue({ amount: 300, percent_off: null }, fmt)).toBe('TT$300 off');
    expect(dealValue({ amount: null, percent_off: 20 }, fmt)).toBe('20% off');
    expect(dealValue({ amount: null, percent_off: null }, fmt)).toBeNull();
    expect(dealValue({ amount: 0, percent_off: null }, fmt)).toBeNull();
  });
});

describe('groupByInterest', () => {
  const ranked = (id: string, tags: string[]) => ({ deal: deal({ id }), tags, score: 1, why: null }) as Parameters<typeof groupByInterest>[0][number];
  it('puts each deal under every interest you picked that it’s about, in your order', () => {
    const forYou = [ranked('nike', ['fashion', 'fitness']), ranked('gym', ['fitness']), ranked('courts', ['home']), ranked('sephora', ['beauty'])];
    const { groups, rest } = groupByInterest(forYou, ['fitness', 'beauty', 'nonsense']);
    expect(groups.map((g) => [g.interest, g.deals.map((d) => d.deal.id)])).toEqual([
      ['fitness', ['nike', 'gym']],
      ['beauty', ['sephora']],
    ]);
    expect(rest.map((d) => d.deal.id)).toEqual(['courts']);
  });
});

describe('cleaner deals', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { sameDealKey, isVague } = require('../deals');
  it('sees the same deal worded twice as one', () => {
    expect(sameDealKey(deal({ id: 'a', merchant: 'Walgreens', title: '$10 Walgreens Cash rewards on $40+', amount: 10 })))
      .toBe(sameDealKey(deal({ id: 'b', merchant: 'Walgreens', title: '$10 Walgreens Cash on $40+', amount: 10 })));
    expect(sameDealKey(deal({ id: 'a', merchant: 'Target', title: 'Buy 1 get 1 50% off Wasa crispbreads', percent_off: 50 })))
      .toBe(sameDealKey(deal({ id: 'b', merchant: 'Target', title: '50% off Wasa crispbreads, buy 1 get 1', percent_off: 50 })));
    expect(sameDealKey(deal({ id: 'a', merchant: 'Target', title: '50% off rugs', percent_off: 50 }))).not.toBe(sameDealKey(deal({ id: 'b', merchant: 'Target', title: '50% off lamps', percent_off: 50 })));
  });
  it('drops banners with nothing to hold onto', () => {
    expect(isVague(deal({ id: 'r', title: 'Up to 50% off rugs', percent_off: 50 }))).toBe(true);
    expect(isVague(deal({ id: 'r', title: 'Up to 50% off rugs', percent_off: 50, ends_on: '2026-11-01' }))).toBe(false);
    expect(isVague(deal({ id: 'r', title: '50% off everything', percent_off: 50 }))).toBe(false);
  });
  it('never counts "Everything else" as a match', () => {
    const p = interestProfile({ ...input, picked: ['shopping'], receipts: [] });
    expect(rankDeals([deal({ id: 'w', merchant: 'Walgreens', category: 'shopping', amount: 10 })], who({ profile: p })).forYou).toEqual([]);
  });
});
