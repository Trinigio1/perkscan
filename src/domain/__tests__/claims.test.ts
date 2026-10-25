import { claimHelp, claimsToCheck, gapsIn, mailtoLink } from '../claims';
import { setHomeCurrency } from '../format';

setHomeCurrency('USD');
const opp = (o: Partial<Parameters<typeof claimHelp>[0]['opp']>) => ({
  type: 'price_drop' as const, title: 'Price drop', merchant: 'Target', value_estimate: null, currency: 'USD', dedupe_key: 'x', action_steps: [], code: null, ...o,
});
const receipt = { merchant: 'TARGET 1234', total: 199.99, currency: 'USD', purchase_date: '2026-10-12', last_four: '4242', order_number: 'T-77' };

describe('claimHelp', () => {
  it('writes a price adjustment request from the receipt, leaving today’s price for the user', () => {
    const h = claimHelp({ opp: opp({}), receipt, name: 'Ana' })!;
    expect(h.kind).toBe('price_adjustment');
    expect(h.message!.subject).toBe('Price adjustment request — order #T-77');
    expect(h.message!.body).toContain('I bought order #T-77 on October 12, 2026 for $199.99.');
    expect(h.message!.body).toContain('Thank you,\nAna');
    expect(h.gaps).toEqual(["[today's price]"]);
  });

  it('never guesses what it doesn’t know', () => {
    const h = claimHelp({ opp: opp({ merchant: null }), receipt: null })!;
    expect(h.gaps).toEqual(expect.arrayContaining(['[store]', '[order number]', "[today's price]", '[your name]']));
    expect(h.message!.body).not.toMatch(/\$\d/);
  });

  it('asks the bank, not the store, to reverse a double charge', () => {
    const h = claimHelp({ opp: opp({ type: 'refund', dedupe_key: 'double_charge:abc' }), receipt, name: 'Ana' })!;
    expect(h.kind).toBe('duplicate_charge');
    expect(h.to).toMatch(/card issuer/);
    expect(h.message!.body).toContain('charged $199.99 twice by Target on October 12, 2026 on my card ending 4242');
  });

  it('asks for a refund with the amount from the email', () => {
    const h = claimHelp({ opp: opp({ type: 'refund', title: 'Flight cancelled', merchant: 'Islandhopper Air', value_estimate: 412.8 }), receipt: null, name: 'Ana' })!;
    expect(h.message!.body).toContain('Please refund $412.80');
    expect(h.gaps).toEqual(['[order number]']);
  });

  it('gives settlement details to copy and the official link, with no message', () => {
    const h = claimHelp({ opp: opp({ type: 'settlement', action_steps: [{ step: 'File', url: 'https://claims.example' }] }), receipt })!;
    expect(h.message).toBeNull();
    expect(h.url).toBe('https://claims.example');
    expect(h.facts.map((f) => f.label)).toEqual(['Store', 'Purchase date', 'Amount paid', 'Order number', 'Card']);
  });

  it('has nothing to send for codes and gift cards', () => {
    expect(claimHelp({ opp: opp({ type: 'promo' }) })).toBeNull();
    expect(claimHelp({ opp: opp({ type: 'gift_card' }) })).toBeNull();
  });
});

describe('helpers', () => {
  it('finds bracketed gaps once each', () => {
    expect(gapsIn('[a] and [b] and [a]')).toEqual(['[a]', '[b]']);
  });
  it('builds a mailto link without a recipient', () => {
    expect(mailtoLink({ subject: 'Hi there', body: 'A & B' })).toBe('mailto:?subject=Hi%20there&body=A%20%26%20B');
  });
  it('asks about claims once their check date comes', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    const list = [
      { id: 'due', status: 'open' as const, claim_started_at: '2026-10-20T00:00:00Z', claim_check_after: '2026-10-24T00:00:00Z' },
      { id: 'later', status: 'open' as const, claim_started_at: '2026-10-24T00:00:00Z', claim_check_after: '2026-10-28T00:00:00Z' },
      { id: 'done', status: 'claimed' as const, claim_started_at: '2026-10-20T00:00:00Z', claim_check_after: '2026-10-24T00:00:00Z' },
      { id: 'never', status: 'open' as const, claim_started_at: null, claim_check_after: null },
    ];
    expect(claimsToCheck(list, now).map((o) => o.id)).toEqual(['due']);
  });
});
