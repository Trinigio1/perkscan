import { checkedPrices, claimHelp, claimsToCheck, fillGaps, gapLabel, gapsIn, mailtoLink } from '../claims';
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

describe('fillGaps', () => {
  const m = { subject: 'Refund request — order [order number]', body: 'Hello,\n\nOrder [order number], paid [amount].\n\nThank you,\n[your name]' };
  it('puts answers in place of the gaps, and leaves unanswered ones visible', () => {
    expect(fillGaps(m, { '[order number]': ' 112-334 ', '[your name]': 'Giovanni' })).toEqual({
      subject: 'Refund request — order 112-334',
      body: 'Hello,\n\nOrder 112-334, paid [amount].\n\nThank you,\nGiovanni',
    });
    expect(gapsIn(fillGaps(m, { '[your name]': 'G' }).body)).toEqual(['[order number]', '[amount]']);
  });
  it('labels a gap in plain words', () => {
    expect(gapLabel('[order number]')).toBe('Order number');
  });
});

describe('price-checked requests', () => {
  it('reads what the price check found, and leaves nothing to fill but what it never saw', () => {
    expect(checkedPrices('Dyson V8: you paid US$399.99, now US$329.99 · Filter: you paid US$20, now US$15')).toEqual([
      { item: 'Dyson V8', paid: 'US$399.99', now: 'US$329.99' },
      { item: 'Filter', paid: 'US$20', now: 'US$15' },
    ]);
    expect(checkedPrices('Some other note')).toEqual([]);
    const help = claimHelp({
      opp: {
        type: 'price_drop', title: 'Price dropped', merchant: 'Target', value_estimate: 70, currency: 'USD', dedupe_key: 'price_adjust:r1', code: null,
        description: 'Dyson V8: you paid US$399.99, now US$329.99',
        action_steps: [{ step: 'Current price of Dyson V8', url: 'https://www.target.com/p/dyson-v8/-/A-1' }, { step: 'Store policy', url: 'https://help.target.com/price-match' }],
      },
      receipt: { merchant: 'Target', total: 399.99, currency: 'USD', purchase_date: '2026-10-28', last_four: '6042', order_number: '112-3344-551' },
      name: 'Giovanni',
    })!;
    expect(help.gaps).toEqual([]);
    expect(help.message!.body).toContain('Dyson V8 was US$399.99 and is now US$329.99. Today\'s price: https://www.target.com/p/dyson-v8/-/A-1');
  });
});

describe('flight claims', () => {
  const flight = (p: Partial<{ title: string; currency: string; code: string | null; value_estimate: number | null }>) => ({
    type: 'refund' as const, merchant: 'Caribbean Airlines', dedupe_key: 'flight:caribbeanairlines:bw484:2026-11-03', action_steps: [],
    title: 'Refund owed: Caribbean Airlines BW 484 on 2026-11-03 was cancelled', currency: 'USD', code: 'XKQ7PL', value_estimate: 669.23, ...p,
  });
  it('asks under the U.S. rules, with the booking reference and the ticket price', () => {
    const h = claimHelp({ opp: flight({}), name: 'Giovanni' })!;
    expect(h.gaps).toEqual([]);
    expect(h.message!.subject).toBe('Refund request — booking XKQ7PL');
    expect(h.message!.body).toContain('My flight Caribbean Airlines BW 484 on 2026-11-03 was cancelled. Booking reference: XKQ7PL.');
    expect(h.message!.body).toContain("refund $669.23 to my original payment method");
  });
  it('claims EU261 compensation without naming an amount', () => {
    const h = claimHelp({ opp: flight({ title: 'Up to €600 compensation: Lufthansa LH 401 on 2026-11-03 arrived 3+ hours late', currency: 'EUR', value_estimate: null, code: null }), name: 'G' })!;
    expect(h.gaps).toEqual(['[booking reference]']);
    expect(h.message!.subject).toBe('EU261 compensation claim — booking [booking reference]');
    expect(h.message!.body).toContain('Under EU Regulation 261/2004');
  });
});
