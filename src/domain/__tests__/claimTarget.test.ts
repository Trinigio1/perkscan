import { opp } from '../__fixtures__/opportunities';
import { claimTarget, followUpQuestion, merchantSite, storeSiteFromEmail } from '../claimTarget';

describe('claimTarget', () => {
  it('opens the merchant for a card credit spent there', () => {
    const t = claimTarget({ opp: opp({ type: 'card_credit', title: 'Lyft credit' }) })!;
    expect(t).toMatchObject({ label: 'Open Lyft', url: 'https://www.lyft.com', followUp: 'used', openItem: false });
  });

  it('falls back to the issuer’s own terms page for other credits', () => {
    const t = claimTarget({ opp: opp({ type: 'card_credit', title: 'Annual travel credit' }), benefit: { name: 'Annual travel credit', source_url: 'https://creditcards.chase.com/x' } })!;
    expect(t).toMatchObject({ label: 'How to use it', url: 'https://creditcards.chase.com/x', hint: 'Opens creditcards.chase.com' });
  });

  it('copies a code and opens the store the email came from', () => {
    const t = claimTarget({ opp: { ...opp({ type: 'promo', code: 'SAVE20', merchant: 'Target' }), sender_domain: 'target.com' } })!;
    expect(t).toMatchObject({ label: 'Use at target.com', url: 'https://www.target.com', copy: 'SAVE20', hint: 'Copies SAVE20, then opens target.com' });
  });

  it('prefers a link from the item itself', () => {
    const t = claimTarget({ opp: { ...opp({ type: 'gift_card', action_steps: [{ step: 'Redeem', url: 'https://gift.example/redeem' }] }), sender_domain: 'example.com' } })!;
    expect(t.url).toBe('https://gift.example/redeem');
  });

  it('sends money you ask for to the request on the item’s screen', () => {
    expect(claimTarget({ opp: opp({ type: 'price_drop', merchant: 'Target' }) })).toMatchObject({ openItem: true, url: null, followUp: 'arrived' });
    expect(claimTarget({ opp: opp({ type: 'refund', dedupe_key: 'double_charge:1' }) })).toMatchObject({ openItem: true });
  });

  it('opens the official form for a settlement', () => {
    const t = claimTarget({ opp: opp({ type: 'settlement', action_steps: [{ step: 'File', url: 'https://settlement.example' }] }) })!;
    expect(t).toMatchObject({ url: 'https://settlement.example', hint: 'Opens the official claim form', followUp: 'arrived' });
  });

  it('never invents a destination', () => {
    expect(claimTarget({ opp: opp({ type: 'promo', code: null }) })).toBeNull();
    expect(claimTarget({ opp: opp({ type: 'card_credit', title: 'Mystery credit' }) })).toBeNull();
    expect(claimTarget({ opp: { ...opp({ type: 'promo' }), sender_domain: 'my.school.edu' } })).toBeNull();
    // Sent through a mailing service: copy the code, but don't open the mailing service.
    expect(claimTarget({ opp: { ...opp({ type: 'promo', code: 'SAVE10', merchant: 'Glow Shop' }), sender_domain: 'klaviyomail.com' } })).toMatchObject({ url: null, label: 'Copy code', copy: 'SAVE10' });
    expect(claimTarget({ opp: opp({ type: 'card_credit', title: 'Lyft credit', status: 'claimed' }) })).toBeNull();
  });

  it('only accepts https links', () => {
    expect(claimTarget({ opp: opp({ type: 'gift_card', action_steps: [{ step: 'x', url: 'http://insecure.example' }] }) })).toBeNull();
  });
});

describe('helpers', () => {
  it('knows the big merchants by name', () => {
    expect(merchantSite('Uber Cash')?.url).toBe('https://www.uber.com');
    expect(merchantSite('Global Entry / TSA PreCheck fee credit')?.name).toBe('Trusted Traveler Programs');
    expect(merchantSite('Dining credit')).toBeNull();
  });
  it('asks the right follow-up question', () => {
    expect(followUpQuestion({ type: 'refund' })).toBe('Did it arrive?');
    expect(followUpQuestion({ type: 'promo' })).toBe('Did you use it?');
  });
});

describe('storeSiteFromEmail', () => {
  it.each([
    ['target.com', 'Target', 'https://www.target.com'],
    ['ulta.com', 'Ulta Beauty', 'https://www.ulta.com'],
    ['email.marriott.com', 'Marriott Bonvoy', 'https://www.marriott.com'],
    ['oldnavy.com', 'Old Navy', 'https://www.oldnavy.com'],
    ['klaviyomail.com', 'Glow Shop', null],
    ['shopifyemail.com', 'Glow Shop', null],
    ['gmail.com', 'Target', null],
    ['randomsender.com', 'Target', null],
    ['target.com', null, null],
  ])('%s for %s', (domain, merchant, site) => expect(storeSiteFromEmail(domain, merchant)).toBe(site));
});
