import { checkCardPage, checkPricePage, similarName, slugify, type KnownBenefit } from '../check';
import type { CardPage } from '../extract';

const URL = 'https://bank.example.com/cards/rewards-plus';
const PAGE = `Rewards Plus Card. Annual fee: $95.
Get up to $100 in airline incidental statement credits each year for qualifying purchases.
Enjoy complimentary Priority Pass Select membership with access to 1,300+ airport lounges.
Cell phone protection: up to $800 per claim when you pay your monthly bill with your card.
Trip delay reimbursement when your flight is delayed more than 6 hours.
Get a $50 hotel credit each anniversary year when you book through the travel portal.`;

const known: KnownBenefit[] = [
  { id: 'rp__airline', name: 'Airline incidental credit', type: 'credit', amount: 100, period: 'annual', status: 'active', source_url: URL },
  { id: 'rp__lounges', name: 'Airport lounge access', type: 'perk', amount: null, period: 'per_claim', status: 'active', source_url: URL },
  { id: 'rp__concierge', name: 'Concierge', type: 'perk', amount: null, period: 'per_claim', status: 'active', source_url: URL },
  { id: 'rp__guide_only', name: 'Rental car coverage', type: 'protection', amount: null, period: 'per_claim', status: 'active', source_url: 'https://bank.example.com/guide.pdf' },
];
const ctx = { page: PAGE, pageUrl: URL, card: { id: 'rp', annual_fee: 95 }, known, currency: 'USD' };
const page = (p: Partial<CardPage>): CardPage => ({
  annual_fee: { amount: 95, evidence: 'Annual fee: $95.' },
  known: [
    { id: 'rp__airline', on_page: true, amount: 100, evidence: 'Get up to $100 in airline incidental statement credits each year for qualifying purchases.' },
    { id: 'rp__lounges', on_page: true, amount: null, evidence: 'Enjoy complimentary Priority Pass Select membership with access to 1,300+ airport lounges.' },
    { id: 'rp__concierge', on_page: false, amount: null, evidence: '' },
    { id: 'rp__guide_only', on_page: false, amount: null, evidence: '' },
  ],
  new_benefits: [],
  ...p,
});

describe('checkCardPage', () => {
  it('confirms perks quoted from the page and flags one sourced there that is gone', () => {
    const c = checkCardPage(page({}), ctx);
    expect(c.confirmed.map((x) => x.id)).toEqual(['rp__airline', 'rp__lounges']);
    expect(c.pageTrusted).toBe(true);
    // Concierge was verified on this page and isn't there; the guide-only perk was never on it.
    expect(c.notOnPage).toEqual(['rp__concierge']);
    expect(c.changes.map((x) => x.kind)).toEqual(['not_on_page']);
  });

  it('never confirms a quote that is not on the page, and never flags perks gone when the page looks wrong', () => {
    const c = checkCardPage(
      page({ known: [{ id: 'rp__airline', on_page: true, amount: 100, evidence: 'Get $100 back on airline fees every single year, guaranteed.' }, { id: 'rp__lounges', on_page: false, amount: null, evidence: '' }] }),
      ctx,
    );
    expect(c.confirmed).toEqual([]);
    expect(c.pageTrusted).toBe(false);
    expect(c.notOnPage).toEqual([]);
  });

  it('holds a changed credit amount and a changed fee for review', () => {
    const changed = PAGE.replace('up to $100 in airline', 'up to $150 in airline').replace('Annual fee: $95.', 'Annual fee: $125.');
    const c = checkCardPage(
      page({
        annual_fee: { amount: 125, evidence: 'Annual fee: $125.' },
        known: [
          { id: 'rp__airline', on_page: true, amount: 150, evidence: 'Get up to $150 in airline incidental statement credits each year for qualifying purchases.' },
          { id: 'rp__lounges', on_page: true, amount: null, evidence: 'Enjoy complimentary Priority Pass Select membership with access to 1,300+ airport lounges.' },
        ],
      }),
      { ...ctx, page: changed },
    );
    expect(c.changes.filter((x) => x.kind !== 'not_on_page').map((x) => [x.kind, x.summary, x.proposed])).toEqual([
      ['amount_changed', 'Airline incidental credit: $100 → $150 (annual)', { amount: 150 }],
      ['fee_changed', 'Annual fee: $95 → $125', { annual_fee: 125 }],
    ]);
  });

  it('ignores an amount the quote does not contain', () => {
    const c = checkCardPage(page({ known: [{ id: 'rp__airline', on_page: true, amount: 300, evidence: 'Get up to $100 in airline incidental statement credits each year for qualifying purchases.' }] }), ctx);
    expect(c.changes.filter((x) => x.kind === 'amount_changed')).toEqual([]);
  });

  it('adds a new perk with no dollar amount on its own, holds a new credit for review, skips ones already listed', () => {
    const c = checkCardPage(
      page({
        new_benefits: [
          { name: 'Trip delay reimbursement', type: 'protection', amount: null, period: null, evidence: 'Trip delay reimbursement when your flight is delayed more than 6 hours.' },
          { name: '$50 hotel credit', type: 'credit', amount: 50, period: 'annual', evidence: 'Get a $50 hotel credit each anniversary year when you book through the travel portal.' },
          { name: 'Priority Pass lounge access', type: 'perk', amount: null, period: null, evidence: 'Enjoy complimentary Priority Pass Select membership with access to 1,300+ airport lounges.' },
          { name: 'Free spa day', type: 'perk', amount: null, period: null, evidence: 'Members get a free spa day every year at any resort.' },
          { name: 'Cell phone protection up to $900', type: 'protection', amount: 900, period: null, evidence: 'Cell phone protection: up to $800 per claim when you pay your monthly bill with your card.' },
        ],
      }),
      ctx,
    );
    expect(c.newPerks.map((p) => [p.slug, p.type])).toEqual([['trip_delay_reimbursement', 'protection']]);
    expect(c.changes.filter((x) => x.kind === 'new_credit').map((x) => [x.summary, x.proposed])).toEqual([['New: $50 hotel credit', { name: '$50 hotel credit', type: 'credit', amount: 50, period: 'annual' }]]);
  });

  it('treats a stated "no annual fee" as a fee of 0', () => {
    const c = checkCardPage(page({ annual_fee: { amount: 0, evidence: 'Rewards Plus Card. Annual fee: $95.' } }), { ...ctx, card: { id: 'rp', annual_fee: null } });
    expect(c.changes.some((x) => x.kind === 'fee_changed')).toBe(false);
  });
});

describe('checkPricePage', () => {
  const pricePage = 'Standard membership: $99 a year. Lounge visits are US$35 per person per visit for members and guests.';
  const price = { amount: 35, currency: 'USD' };
  it('confirms the same price, updates a modest change, holds a big one, and refuses a quote not on the page', () => {
    expect(checkPricePage({ amount: 35, currency: 'USD', evidence: 'Lounge visits are US$35 per person per visit for members and guests.' }, { page: pricePage, price }).result).toBe('confirmed');
    const up = pricePage.replace('US$35', 'US$38');
    expect(checkPricePage({ amount: 38, currency: 'USD', evidence: 'Lounge visits are US$38 per person per visit for members and guests.' }, { page: up, price })).toEqual({ result: 'updated', amount: 38, evidence: 'Lounge visits are US$38 per person per visit for members and guests.' });
    const jump = pricePage.replace('US$35', 'US$99');
    expect(checkPricePage({ amount: 99, currency: 'USD', evidence: 'Lounge visits are US$99 per person per visit for members and guests.' }, { page: jump, price }).result).toBe('changed');
    expect(checkPricePage({ amount: 30, currency: 'USD', evidence: 'Lounge visits are US$30 per person per visit.' }, { page: pricePage, price }).result).toBe('not_on_page');
    expect(checkPricePage({ amount: 99, currency: 'USD', evidence: 'Lounge visits are US$35 per person per visit for members and guests.' }, { page: pricePage, price }).result).toBe('not_on_page');
    expect(checkPricePage({ amount: 35, currency: 'EUR', evidence: 'Lounge visits are US$35 per person per visit for members and guests.' }, { page: pricePage, price }).result).toBe('not_on_page');
    expect(checkPricePage({ amount: null, currency: null, evidence: '' }, { page: pricePage, price }).result).toBe('not_on_page');
  });
});

describe('helpers', () => {
  it('matches perks by their words, and makes safe ids', () => {
    expect(similarName('Airport lounge access', 'Priority Pass lounge access')).toBe(true);
    expect(similarName('Trip delay reimbursement', 'Airport lounge access')).toBe(false);
    expect(slugify('Cell phone protection (up to $800)!')).toBe('cell_phone_protection_up_to_800');
  });
});
