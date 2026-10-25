import { whyYouHaveThis, type WhyContext } from '../reasons';
import { opp } from '../__fixtures__/opportunities';

const ctx: WhyContext = {
  cardLabel: (id) => (id === 'uc1' ? 'Amex Gold ·· 4242' : ''),
  receiptById: (id) => (id === 'r1' ? { merchant: 'Zara', purchase_date: '2026-10-03' } : undefined),
};

describe('whyYouHaveThis', () => {
  it('says a card credit comes with your card', () => {
    expect(whyYouHaveThis(opp({ type: 'card_credit' }), ctx)).toEqual({ short: 'Amex Gold ·· 4242', long: 'Because you have Amex Gold ·· 4242. It comes with the card.' });
  });

  it('points to the purchase it was matched to', () => {
    expect(whyYouHaveThis(opp({ type: 'protection', source_receipt_id: 'r1' }), ctx)?.long).toBe('Because you bought from Zara on Oct 3 with Amex Gold ·· 4242.');
    expect(whyYouHaveThis(opp({ type: 'settlement', user_card_id: null, source_receipt_id: 'r1', dedupe_key: 'settlement:s1' }), ctx)?.long).toBe(
      'Because you bought from Zara on Oct 3, within this settlement’s purchase dates.',
    );
  });

  it('says which inbox it came from', () => {
    const base = { type: 'promo' as const, user_card_id: null, benefit_id: null, source_message_id: 'm1' };
    expect(whyYouHaveThis({ ...opp(base), sender_domain: 'target.com', message_source: 'email' }, ctx)).toEqual({ short: 'From your email', long: 'Found in an email from target.com.' });
    expect(whyYouHaveThis({ ...opp(base), message_source: 'sms' }, ctx)?.short).toBe('From a text');
    expect(whyYouHaveThis({ ...opp(base), message_source: 'share' }, ctx)?.short).toBe('From something you shared');
  });

  it('knows what you added or saved yourself', () => {
    expect(whyYouHaveThis(opp({ type: 'gift_card', dedupe_key: 'manual:abc', user_card_id: null }), ctx)?.short).toBe('You added this');
    expect(whyYouHaveThis(opp({ type: 'promo', merchant: 'Target', dedupe_key: 'deal:confirmed:t1', user_card_id: null }), ctx)?.short).toBe('Saved from Target’s offers');
  });

  it('says nothing rather than guess', () => {
    expect(whyYouHaveThis(opp({ type: 'promo', user_card_id: null, benefit_id: null }), ctx)).toBeNull();
  });
});
