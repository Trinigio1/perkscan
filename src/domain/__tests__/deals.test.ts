import { dealValue, domainStoreKey, matchStore, storeKey, storeOffers, storeProfile, type Deal, type OffersFor, type StoreInput } from '../deals';

const TODAY = '2026-10-23';
const deal = (d: Partial<Deal> & { id: string }): Deal => ({
  source: 'official', merchant: d.id, merchant_keys: [], title: d.id, summary: null, category: 'shopping', amount: null, percent_off: null,
  currency: null, code: null, min_spend: null, countries: ['TT'], regions: [], starts_on: null, ends_on: null, url: 'https://x.example',
  evidence: 'x', confidence: 'confirmed', seen_by: 0, saves: 0, ...d,
});
const opp = (o: Partial<StoreInput['opportunities'][number]>) => ({ merchant: null, code: null, type: 'promo' as const, dedupe_key: null, value_estimate: null, source_message_id: null, ...o });

const input: StoreInput = {
  receipts: [
    { merchant: 'COURTS (TRINIDAD) LTD' },
    { merchant: 'Uber Eats' },
    { merchant: 'Uber Eats' },
    { merchant: 'Massy Stores' },
  ],
  opportunities: [
    // Massy emails you its promotions.
    opp({ merchant: 'Massy Stores', code: 'MASSY10', value_estimate: 10, source_message_id: 'm1' }),
  ],
  senderDomains: ['pricesmart.com', 'gmail.com'],
};
const profile = storeProfile(input);
const who = (over: Partial<OffersFor> = {}): OffersFor => ({ country: 'TT', today: TODAY, stores: profile, feedback: [], ...over });

describe('store names', () => {
  it('reads the same store the same way everywhere', () => {
    expect(storeKey('COURTS (TRINIDAD) LTD')).toBe('courts');
    expect(domainStoreKey('email.courts.co.tt')).toBe('courts');
    expect(domainStoreKey('courts.co.tt')).toBe('courts');
    expect(domainStoreKey('mail.target.com')).toBe('target');
    expect(domainStoreKey('my.uwi.edu')).toBeNull();
  });
});

describe('storeProfile', () => {
  it('separates stores you shop at from stores that email you', () => {
    expect([...profile.shops]).toEqual(['courts', 'ubereats', 'massystores']);
    expect(profile.follows.has('pricesmart')).toBe(true);
    expect(profile.follows.has('massystores')).toBe(true);
    expect(profile.follows.has('courts')).toBe(false);
  });
});

describe('matchStore', () => {
  it('matches a store however its name is written', () => {
    expect(matchStore({ merchant: 'Courts', merchant_keys: ['courts'] }, profile.shops)).toBe('courts');
    expect(matchStore({ merchant: 'Nike', merchant_keys: ['nike'] }, profile.shops)).toBeNull();
  });
});

describe('storeOffers: only at stores you already use', () => {
  const deals = [
    deal({ id: 'courts', merchant: 'Courts', merchant_keys: ['courts'], category: 'home', amount: 300 }),
    deal({ id: 'pricesmart', merchant: 'PriceSmart', merchant_keys: ['pricesmart'], category: 'electronics', percent_off: 15 }),
    deal({ id: 'massy_same', merchant: 'Massy Stores', merchant_keys: ['massystores'], category: 'groceries', code: 'MASSY10', amount: 10 }),
    deal({ id: 'nike', category: 'fashion', percent_off: 40 }),
    deal({ id: 'shared_courts', source: 'shared', merchant: 'Courts', merchant_keys: ['courts'], amount: 50 }),
    deal({ id: 'us_only', merchant: 'Courts', merchant_keys: ['courts'], countries: ['US'] }),
    deal({ id: 'ended', merchant: 'Courts', merchant_keys: ['courts'], ends_on: '2026-10-20' }),
    deal({ id: 'florida', merchant: 'Courts', merchant_keys: ['courts'], regions: ['FL'] }),
  ];

  it('shows stores you shop at first, then stores that email you, and says why', () => {
    expect(storeOffers(deals, who()).map((x) => [x.deal.id, x.why])).toEqual([
      ['courts', 'You shop at Courts'],
      ['pricesmart', 'PriceSmart emails you'],
    ]);
  });

  it('never shows a store you don’t use, other people’s codes, or what’s already in your Money', () => {
    const ids = storeOffers(deals, who()).map((x) => x.deal.id);
    expect(ids).not.toContain('nike');
    expect(ids).not.toContain('shared_courts');
    expect(ids).not.toContain('massy_same');
  });

  it('keeps deals you saved', () => {
    const p = storeProfile({ ...input, opportunities: [...input.opportunities, opp({ merchant: 'Courts', code: 'COOL300', value_estimate: 300, dedupe_key: 'deal:confirmed:courts' })] });
    const r = storeOffers([deal({ id: 'courts', merchant: 'Courts', merchant_keys: ['courts'], amount: 300, code: 'COOL300' })], who({ stores: p }));
    expect(r.map((x) => x.deal.id)).toEqual(['courts']);
  });

  it('only shows offers where you live, that haven’t ended', () => {
    const ids = storeOffers(deals, who()).map((x) => x.deal.id);
    expect(ids).not.toContain('us_only');
    expect(ids).not.toContain('ended');
    expect(ids).not.toContain('florida');
    expect(storeOffers(deals, who({ country: null }))).toEqual([]);
  });

  it('hides what you dismissed or said didn’t work', () => {
    const r = storeOffers(deals, who({ feedback: [{ deal_id: 'courts', action: 'dismissed' }, { deal_id: 'pricesmart', action: 'didnt_work' }] }));
    expect(r).toEqual([]);
  });

  it('breaks ties by urgency and confidence', () => {
    const c = (id: string, over: Partial<Deal>) => deal({ id, merchant: 'Courts', merchant_keys: ['courts'], ...over });
    const r = storeOffers([c('later', { ends_on: '2026-12-01' }), c('soon', { ends_on: '2026-10-25' }), c('unsure', { confidence: 'check', ends_on: '2026-12-01' })], who());
    expect(r.map((x) => x.deal.id)).toEqual(['soon', 'later', 'unsure']);
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
