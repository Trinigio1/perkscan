import { opp } from '../__fixtures__/opportunities';
import { emailOffersFor, interestsFor, storeInterests } from '../interests';

describe('storeInterests', () => {
  it('knows well-known stores however the receipt or alert writes them', () => {
    expect(storeInterests('PLANET FITNESS #1123')).toEqual(['fitness']);
    expect(storeInterests('Sephora')).toEqual(['beauty']);
    expect(storeInterests('BATH AND BODY WORKS 0412')).toEqual(['beauty']);
    expect(storeInterests("Kohl's")).toEqual(['fashion']);
    expect(storeInterests('UBER * EATS')).toEqual(['delivery']);
    expect(storeInterests('TST* SHAKE SHACK 1234')).toEqual(['dining']);
    expect(storeInterests('Walmart.com')).toEqual(['shopping']);
    expect(storeInterests('Booking.com')).toEqual(['travel']);
    expect(storeInterests('H&M')).toEqual(['fashion']);
  });

  it('can know a store for more than one thing', () => {
    expect(storeInterests('Nike')).toEqual(expect.arrayContaining(['fitness', 'fashion']));
    expect(storeInterests('PriceSmart')).toEqual(expect.arrayContaining(['groceries', 'home']));
  });

  it('matches whole words only, longest name first', () => {
    expect(storeInterests('Clearance Outlet')).toEqual([]);
    expect(storeInterests("Applebee's Grill")).toEqual(['dining']);
    expect(storeInterests('Apple Store')).toEqual(['electronics']);
    expect(storeInterests('Apple Music')).toEqual(['entertainment']);
    expect(storeInterests('Gap Kids')).toEqual(['fashion']);
    expect(storeInterests('Mind the Gap Pub')).toEqual([]);
    expect(storeInterests('Some Corner Shop')).toEqual([]);
    expect(storeInterests(null)).toEqual([]);
  });
});

describe('interestsFor', () => {
  it('puts the filed category first, then the store, then clear words', () => {
    expect(interestsFor({ category: 'fashion', merchant: 'Nike', title: '20% off running shoes' })).toEqual(['fashion', 'fitness']);
    expect(interestsFor({ merchant: 'Corner Studio', title: 'First yoga class free' })).toEqual(['fitness']);
    expect(interestsFor({ merchant: 'Local Spot', title: 'Half-price pizza Tuesdays' })).toEqual(['dining']);
  });

  it('only says "everything else" when nothing more specific fits', () => {
    expect(interestsFor({ merchant: 'Amazon', title: '$10 off headphones' })).toEqual(['electronics']);
    expect(interestsFor({ merchant: 'Amazon', title: '$10 off your order' })).toEqual(['shopping']);
    expect(interestsFor({ category: 'shopping', merchant: 'Planet Fitness' })).toEqual(['fitness']);
    expect(interestsFor({ merchant: 'Acme', title: 'Save today' })).toEqual([]);
  });
});

describe('the email reader uses the same interests as the app', () => {
  it('has the same ids', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { INTEREST_IDS } = require('../../../supabase/functions/_shared/inbox/schema.ts');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { INTERESTS } = require('../deals');
    expect([...INTEREST_IDS].sort()).toEqual(INTERESTS.map((i: { id: string }) => i.id).sort());
  });
});

describe('emailOffersFor', () => {
  const NOW = new Date('2026-10-20T12:00:00Z');

  it('finds open offers about an interest: tagged by the reader, or by the store and wording for older ones', () => {
    const offers = [
      opp({ id: 'a', type: 'promo', merchant: 'Iron Gym', title: 'PT50', interest: 'fitness', expires_at: '2026-10-26T23:59:59Z' }),
      opp({ id: 'b', type: 'store_credit', merchant: 'Planet Fitness', title: '$10 credit', expires_at: '2026-10-22T23:59:59Z' }),
      opp({ id: 'c', type: 'promo', merchant: 'Sephora', title: 'Free gift', interest: 'beauty' }),
      opp({ id: 'd', type: 'promo', merchant: 'Planet Fitness', title: 'Old', expires_at: '2026-10-01T00:00:00Z' }),
      opp({ id: 'e', type: 'return_window', merchant: 'Nike', title: 'Return window' }),
      opp({ id: 'f', type: 'promo', merchant: 'Planet Fitness', title: 'Used', status: 'claimed' }),
    ];
    expect(emailOffersFor('fitness', offers, NOW).map((o) => o.id)).toEqual(['b', 'a']);
    expect(emailOffersFor('beauty', offers, NOW).map((o) => o.id)).toEqual(['c']);
  });
});
