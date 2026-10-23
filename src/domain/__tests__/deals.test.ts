import { dealValue, interestProfile, rankDeals, shopsAt, suggestedInterests, type Deal, type DealsFor } from '../deals';

const TODAY = '2026-10-23';
const deal = (d: Partial<Deal> & { id: string }): Deal => ({
  source: 'official', merchant: d.id, merchant_keys: [], title: d.id, summary: null, category: 'shopping', amount: null, percent_off: null,
  currency: null, code: null, min_spend: null, countries: ['TT'], regions: [], starts_on: null, ends_on: null, url: 'https://x.example',
  evidence: 'x', confidence: 'confirmed', seen_by: 0, saves: 0, ...d,
});

const profile = interestProfile({
  picked: ['fitness'],
  receipts: [
    { merchant: 'COURTS (TRINIDAD) LTD', purchase_type: 'appliance' },
    { merchant: 'Uber Eats', purchase_type: 'food_delivery' },
    { merchant: 'Uber Eats', purchase_type: 'food_delivery' },
  ],
  opportunities: [{ merchant: 'PriceSmart' }],
  senderDomains: ['email.massystores.com', 'mail.example.com'],
});
const who = (over: Partial<DealsFor> = {}): DealsFor => ({ country: 'TT', today: TODAY, profile, feedback: [], ...over });

describe('interestProfile', () => {
  it('learns what you spend on and where you shop', () => {
    expect(profile.inferred.get('delivery')).toBe(2);
    expect(profile.inferred.get('home')).toBe(1);
    expect(profile.stores.has('pricesmart')).toBe(true);
    expect(profile.stores.has('massystores')).toBe(true);
    expect(profile.stores.has('mail')).toBe(false);
    expect(suggestedInterests(profile)).toEqual(['delivery', 'home']);
  });
});

describe('shopsAt', () => {
  it('matches a store however its name is written', () => {
    expect(shopsAt({ merchant: 'Courts', merchant_keys: ['courts'] }, profile.stores)).toBe(true);
    expect(shopsAt({ merchant: 'Massy Stores', merchant_keys: ['massy', 'massystores'] }, profile.stores)).toBe(true);
    expect(shopsAt({ merchant: 'Nike', merchant_keys: ['nike'] }, profile.stores)).toBe(false);
  });
});

describe('rankDeals', () => {
  const deals = [
    deal({ id: 'courts', merchant: 'Courts', merchant_keys: ['courts'], category: 'home', amount: 300 }),
    deal({ id: 'gym', category: 'fitness', percent_off: 20 }),
    deal({ id: 'pizza', category: 'delivery', amount: 25 }),
    deal({ id: 'nike', category: 'fashion', percent_off: 40 }),
    deal({ id: 'us_only', countries: ['US'], category: 'home' }),
    deal({ id: 'ended', category: 'home', ends_on: '2026-10-20' }),
    deal({ id: 'florida', countries: ['TT'], regions: ['FL'], category: 'home' }),
  ];

  it('puts stores you use first, then what you picked, then what you spend on', () => {
    const r = rankDeals(deals, who());
    expect(r.forYou.map((x) => x.deal.id)).toEqual(['courts', 'gym', 'pizza']);
    expect(r.forYou.map((x) => x.why)).toEqual(['You shop at Courts', 'You picked Fitness', 'You spend on food delivery']);
  });

  it('keeps the rest as popular near you, without a reason', () => {
    expect(rankDeals(deals, who()).popular.map((x) => [x.deal.id, x.why])).toEqual([['nike', null]]);
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
    expect(ids.indexOf('courts2')).toBeGreaterThan(-1);
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

describe('dealValue', () => {
  it('shows only stated numbers', () => {
    const fmt = (n: number) => `TT$${n}`;
    expect(dealValue({ amount: 300, percent_off: null }, fmt)).toBe('TT$300 off');
    expect(dealValue({ amount: null, percent_off: 20 }, fmt)).toBe('20% off');
    expect(dealValue({ amount: null, percent_off: null }, fmt)).toBeNull();
  });
});
