import { opp } from '../__fixtures__/opportunities';
import { isMutedOffer, isMutedStore, muteKeyOf } from '../mutes';

describe('hidden stores', () => {
  it('keys a store by its email domain, else its name', () => {
    expect(muteKeyOf({ merchant: 'Uber Eats', sender_domain: 'email.uber.com' })).toBe('uber');
    expect(muteKeyOf({ merchant: 'Trip.com', sender_domain: null })).toBe('tripcom');
  });

  it('hides offers from a hidden store, however it names itself', () => {
    const promo = (o: Parameters<typeof opp>[0]) => opp({ type: 'promo', category: 'promos', user_card_id: null, benefit_id: null, ...o });
    expect(isMutedOffer(promo({ merchant: 'Uber Eats', sender_domain: 'uber.com' }), ['uber'])).toBe(true);
    expect(isMutedOffer(promo({ merchant: 'Uber', sender_domain: 'email.uber.com' }), ['uber'])).toBe(true);
    expect(isMutedOffer(promo({ merchant: 'Trip.com', sender_domain: 'trip.com' }), ['trip'])).toBe(true);
    expect(isMutedOffer(promo({ merchant: 'Nike', sender_domain: 'nike.com' }), ['uber'])).toBe(false);
  });

  it('never hides card credits, things added by hand, or what you already acted on', () => {
    expect(isMutedOffer(opp({ type: 'card_credit', merchant: 'Uber', sender_domain: null }), ['uber'])).toBe(false);
    expect(isMutedOffer(opp({ type: 'promo', merchant: 'Uber Eats', dedupe_key: 'manual:1' }), ['uber'])).toBe(false);
    expect(isMutedOffer(opp({ type: 'promo', merchant: 'Uber Eats', status: 'claimed' }), ['uber'])).toBe(false);
  });

  it('matches deals by store name', () => {
    expect(isMutedStore('ubereats', ['uber'])).toBe(true);
    expect(isMutedStore('tripcom', ['trip'])).toBe(true);
    expect(isMutedStore('target', ['tar'])).toBe(false);
  });
});
