import type { Offer, ParsedEmail } from '../schema.ts';
import { merchantKey, sightingsFrom } from '../sightings.ts';

const TODAY = '2026-10-23';
const offer = (o: Partial<Offer>): Offer => ({
  type: 'promo', currency: 'TTD', title: 'TT$50 off', amount: 50, percent_off: null, code: 'SAVE50', expires_on: '2026-11-01',
  min_spend: null, points: null, claim_url: null, details: null, ...o,
});
const email = (p: Partial<ParsedEmail>): ParsedEmail => ({ kind: 'promo', merchant: 'Courts', summary: 'Divali sale', receipt: null, offers: [offer({})], ...p });

describe('sightingsFrom', () => {
  it('shares only the store, offer, code and dates', () => {
    expect(sightingsFrom(email({}), 'TT', TODAY)).toEqual([
      { country: 'TT', merchant: 'Courts', merchant_key: 'courts', code: 'SAVE50', offer_key: 'SAVE50', title: 'TT$50 off', amount: 50, percent_off: null, currency: 'TTD', min_spend: null, ends_on: '2026-11-01' },
    ]);
  });
  it('skips personal codes, codes without a value, expired codes and non-promos', () => {
    expect(sightingsFrom(email({ offers: [offer({ details: 'Happy birthday! A gift just for you' })] }), 'TT', TODAY)).toEqual([]);
    expect(sightingsFrom(email({ offers: [offer({ amount: null, code: null })] }), 'TT', TODAY)).toEqual([]);
    expect(sightingsFrom(email({ offers: [offer({ expires_on: '2026-10-01' })] }), 'TT', TODAY)).toEqual([]);
    expect(sightingsFrom(email({ kind: 'receipt' }), 'TT', TODAY)).toEqual([]);
    expect(sightingsFrom(email({ offers: [offer({ type: 'gift_card' })] }), 'TT', TODAY)).toEqual([]);
    expect(sightingsFrom(email({}), null, TODAY)).toEqual([]);
  });
  it('shares dated promotions without a code, keyed by their number and end date', () => {
    const [s] = sightingsFrom(email({ merchant: 'Massy Stores', offers: [offer({ code: null, amount: null, percent_off: 20, title: '20% off produce' })] }), 'TT', TODAY);
    expect(s).toMatchObject({ code: null, offer_key: 'p20:2026-11-01', merchant_key: 'massystores' });
    expect(sightingsFrom(email({ offers: [offer({ code: null, expires_on: null })] }), 'TT', TODAY)).toEqual([]);
  });
  it('recognises the same store however it’s written', () => {
    expect(merchantKey('COURTS (TRINIDAD) LTD')).toBe('courts');
    expect(merchantKey('Massy Stores')).toBe('massystores');
  });
});
