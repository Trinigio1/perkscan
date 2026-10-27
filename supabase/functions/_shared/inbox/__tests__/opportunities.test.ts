import { isOrderUpdate, isPrice, notAPerk, notMoneyOwed, offerWords, readNote, toRows } from '../opportunities.ts';
import type { Offer, ParsedEmail } from '../schema.ts';

const TODAY = '2026-04-10';
const offer = (o: Partial<Offer>): Offer => ({
  type: 'promo', currency: null, title: 'Deal', amount: null, percent_off: null, code: null, expires_on: null,
  min_spend: null, points: null, claim_url: null, details: null, ...o,
});
const email = (p: Partial<ParsedEmail>): ParsedEmail => ({ kind: 'promo', merchant: 'Acme', summary: '', receipt: null, offers: [], ...p });

describe('toRows', () => {
  it('turns a promo code into an opportunity with steps', () => {
    const { opportunities } = toRows(email({ offers: [offer({ title: '$20 off $100', amount: 20, code: 'SAVE20', min_spend: 100, expires_on: '2026-04-30' })] }), TODAY);
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({ type: 'promo', value_estimate: null, discount_amount: 20, code: 'SAVE20', expires_at: '2026-04-30T23:59:59Z', dedupe_key: 'promo:acme:save20:2026-04-30', min_spend: 100 });
    expect(opportunities[0]!.action_steps.map((s) => s.step).join(' ')).toContain('SAVE20');
  });

  it('tags every offer with what the email is about', () => {
    const { opportunities } = toRows(email({ merchant: 'Sephora', interest: 'beauty', offers: [offer({ type: 'promo', title: 'Free birthday gift', expires_on: '2026-04-30' })] }), TODAY);
    expect(opportunities[0]).toMatchObject({ interest: 'beauty', value_estimate: null });
    expect(toRows(email({ offers: [offer({ amount: 5, expires_on: '2026-04-30' })] }), TODAY).opportunities[0]!.interest).toBeNull();
  });

  it('treats "spend $X, save $Y" as a discount, not money you have', () => {
    const { opportunities } = toRows(
      email({ merchant: 'Uber Eats', offers: [offer({ title: 'Spend $75, save $15 at Pura Vida Miami', amount: 15 }), offer({ title: '$7 off your next order', amount: 7, code: 'EATS7' })] }),
      TODAY,
    );
    expect(opportunities.map((o) => [o.value_estimate, o.discount_amount, o.min_spend])).toEqual([[null, 15, 75], [7, null, null]]);
  });

  it('uses the currency an offer states', () => {
    const { opportunities } = toRows(email({ merchant: 'Trip.com', offers: [offer({ title: '60 EUR off European hotels', amount: 60, code: 'EU60' })] }), TODAY);
    expect(opportunities[0]!.currency).toBe('EUR');
  });

  it('keys offers by the store that sent them, however it names itself', () => {
    const a = toRows(email({ merchant: 'Uber Eats', offers: [offer({ title: '$15.87 off select items at Domino’s', amount: 15.87 })] }), TODAY, 'USD', null, { fromDomain: 'uber.com' });
    const b = toRows(email({ merchant: 'Uber', offers: [offer({ title: '$15.87 off select items at Domino’s', amount: 15.87 })] }), TODAY, 'USD', null, { fromDomain: 'email.uber.com' });
    expect(a.opportunities[0]!.dedupe_key).toBe(b.opportunities[0]!.dedupe_key);
    expect(a.opportunities[0]!.dedupe_key).toMatch(/^promo:uber:/);
  });

  it('shows in-app deals for a week from when the email was sent', () => {
    const deal = offer({ title: 'Buy 1, Get 1 Free at Shake Shack' });
    const old = toRows(email({ merchant: 'Uber Eats', offers: [deal] }), TODAY, 'USD', null, { sentOn: '2026-03-20', fromDomain: 'uber.com' });
    expect(old.opportunities).toEqual([]);
    expect(old.skipped.expired).toBe(1);
    const recent = toRows(email({ merchant: 'Uber Eats', offers: [deal] }), TODAY, 'USD', null, { sentOn: '2026-04-08', fromDomain: 'uber.com' });
    expect(recent.opportunities[0]).toMatchObject({ expires_at: '2026-04-15T23:59:59Z' });
    expect(recent.opportunities[0]!.dedupe_key).toMatch(/^inapp:uber:.*:2026-04-06$/);
  });

  it('keeps up to 3 in-app deals per email for a week, never as money', () => {
    const { opportunities, skipped } = toRows(
      email({
        merchant: 'Uber Eats',
        interest: 'delivery',
        offers: [
          offer({ title: 'Buy 1, Get 1 Free at Shake Shack' }),
          offer({ title: 'Free item over $15 at Taco Rico' }),
          offer({ title: 'BOGO at Burger King' }),
          offer({ title: 'Buy one get one at Cuban Guys' }),
          offer({ title: 'Popular restaurants near you' }),
        ],
      }),
      TODAY,
    );
    expect(opportunities.map((o) => o.title)).toEqual(['Buy 1, Get 1 Free at Shake Shack', 'Free item over $15 at Taco Rico', 'BOGO at Burger King']);
    expect(opportunities[0]).toMatchObject({ value_estimate: null, code: null, expires_at: '2026-04-17T23:59:59Z', interest: 'delivery' });
    expect(opportunities[0]!.dedupe_key).toMatch(/^inapp:uber-eats:.*shack.*:2026-04-06$/);
    expect(skipped.noValue).toBe(2);
  });

  it('keeps a free perk with its official link, even without a date', () => {
    const { opportunities } = toRows(email({ merchant: 'University of Miami', offers: [offer({ title: 'Free Microsoft 365 for students', claim_url: 'https://it.miami.edu/office' }), offer({ title: 'Free pizza Friday' })] }), TODAY);
    expect(opportunities.map((o) => o.title)).toEqual(['Free Microsoft 365 for students']);
    expect(opportunities[0]!.value_estimate).toBeNull();
  });

  it('keeps a percent off as a number, never as money', () => {
    const { opportunities } = toRows(email({ offers: [offer({ title: '20% off sitewide', percent_off: 20, code: 'TWENTY', expires_on: '2026-04-30' })] }), TODAY);
    expect(opportunities[0]).toMatchObject({ percent_off: 20, value_estimate: null });
  });

  it('counts an issued reward like store credit', () => {
    const { opportunities } = toRows(email({ merchant: "Kohl's", interest: 'fashion', offers: [offer({ type: 'store_credit', title: "$10 Kohl's Cash", amount: 10, expires_on: '2026-04-25' })] }), TODAY);
    expect(opportunities[0]).toMatchObject({ type: 'store_credit', value_estimate: 10, interest: 'fashion' });
  });

  it('skips offers that already expired or carry no value, code or deadline', () => {
    const { opportunities } = toRows(email({ offers: [offer({ amount: 10, expires_on: '2026-04-01' }), offer({ title: 'Big sale!' })] }), TODAY);
    expect(opportunities).toHaveLength(0);
  });

  it('never gives free trials a dollar value', () => {
    const { opportunities } = toRows(email({ offers: [offer({ type: 'free_trial', title: 'Trial ends', amount: 14.99, expires_on: '2026-04-20' })] }), TODAY);
    expect(opportunities[0]).toMatchObject({ type: 'free_trial', value_estimate: null });
    expect(opportunities[0]!.action_steps.map((s) => s.step).join(' ')).toContain('$14.99');
  });

  it('keeps settlement claim links only as a step', () => {
    const { opportunities } = toRows(email({ offers: [offer({ type: 'settlement', title: 'Settlement', amount: 50, claim_url: 'https://claims.example.com', expires_on: '2026-09-01' })] }), TODAY);
    expect(opportunities[0]!.action_steps.some((s) => s.url === 'https://claims.example.com')).toBe(true);
    expect(opportunities[0]!.action_steps[0]!.step).toContain('never files');
  });

  it('builds a receipt with its return date, but no return-window reminder', () => {
    const rows = toRows(
      email({
        kind: 'receipt',
        receipt: { total: 101.99, currency: 'USD', purchase_type: 'clothing', travel_date: null, purchase_date: '2026-04-05', card_last_four: '4242', order_number: 'A1', return_by: null, return_window_days: 30, items: [] },
      }),
      TODAY,
    );
    expect(rows.receipt).toMatchObject({ merchant: 'Acme', total: 101.99, last_four: '4242', return_by: '2026-05-05' });
    expect(rows.opportunities).toEqual([]);
  });

  it('saves no receipt for order updates (shipped, delivered, on hold, declined)', () => {
    const receiptEmail = email({
      kind: 'receipt',
      receipt: { total: 89.99, currency: 'USD', purchase_type: 'home', travel_date: null, purchase_date: '2026-04-05', card_last_four: null, order_number: '112-3344556', return_by: null, return_window_days: null, items: [] },
    });
    for (const subject of ['Shipped: "Memory foam mattress"', 'Delivered: your package', 'Your Amazon order is on hold', 'Payment declined for order 112-3344556', 'Arriving tomorrow: 1 item']) {
      expect(toRows(receiptEmail, TODAY, 'USD', null, { subject }).receipt).toBeNull();
    }
    expect(toRows(receiptEmail, TODAY, 'USD', null, { subject: 'Your Amazon.com order of "Mattress" has been confirmed' }).receipt).not.toBeNull();
    expect(toRows(receiptEmail, TODAY, 'USD', null, { subject: 'Your Instacart order was delivered: receipt' }).receipt).not.toBeNull();
  });

  it('leaves out things that are not perks: card applications, interviews, signing up for texts', () => {
    for (const title of ['Apply for Robinhood Gold Card (3% cash back)', '$100 Visa gift card for a case study interview', '15% off when you connect via text', 'Sign up for emails and get 10% off']) {
      expect(notAPerk({ title, details: null })).toBe(true);
    }
    for (const title of ['40% off your first grocery order from ALDI', 'Grammarly Pro 50% off', '$5 Michaels Rewards voucher']) {
      expect(notAPerk({ title, details: null })).toBe(false);
    }
    expect(toRows(email({ offers: [offer({ title: 'Apply for Robinhood Gold Card (3% cash back)', amount: null, expires_on: '2099-01-01' })] }), TODAY).skipped.notMoney).toBe(1);
  });

  it('never counts a price or a referral reward as money', () => {
    expect(isPrice({ title: "Broadway's Beaches for $59", details: null })).toBe(true);
    expect(isPrice({ title: 'Plans from $9.99', details: null })).toBe(true);
    expect(isPrice({ title: '$20 off orders from $50', details: null })).toBe(false);
    expect(isPrice({ title: '$10 off groceries', details: null })).toBe(false);
    expect(notMoneyOwed({ title: 'Spread the love and get $20 off', details: null })).toBe(true);
    expect(notMoneyOwed({ title: 'Give $20, get $20', details: null })).toBe(true);
    expect(notMoneyOwed({ title: '$10 off', details: 'Invite friends to earn more' })).toBe(true);
    expect(notMoneyOwed({ title: '$5 Michaels Rewards voucher', details: null })).toBe(false);
    const { opportunities } = toRows(email({ offers: [offer({ title: "Broadway's Beaches for $59", amount: 59, code: 'BEACH' })] }), TODAY);
    expect(opportunities[0]!.value_estimate).toBeNull();
  });

  it('tells order updates from receipts by subject', () => {
    expect(isOrderUpdate('Your package is out for delivery')).toBe(true);
    expect(isOrderUpdate('Delivery date changed for your order')).toBe(true);
    expect(isOrderUpdate('Thanks for your order')).toBe(false);
    expect(isOrderUpdate('Your Wednesday evening order with Uber Eats')).toBe(false);
    expect(isOrderUpdate(null)).toBe(false);
  });

  it('uses the offer currency, then the receipt currency, then the home currency', () => {
    expect(toRows(email({ offers: [offer({ amount: 5, code: 'A', currency: 'TTD' })] }), TODAY).opportunities[0]!.currency).toBe('TTD');
    expect(toRows(email({ offers: [offer({ amount: 5, code: 'B' })] }), TODAY, 'TTD').opportunities[0]!.currency).toBe('TTD');
    expect(toRows(email({ offers: [offer({ amount: 5, code: 'C' })] }), TODAY).opportunities[0]!.currency).toBe('USD');
  });

  it('removes duplicate offers within one email', () => {
    const o = offer({ amount: 5, code: 'FIVE' });
    expect(toRows(email({ offers: [o, { ...o }] }), TODAY).opportunities).toHaveLength(1);
  });

  it('labels points by quantity when the title has no number', () => {
    const { opportunities } = toRows(email({ offers: [offer({ type: 'points', title: 'Your points', points: 12500, expires_on: '2026-06-01' })] }), TODAY);
    expect(opportunities[0]).toMatchObject({ title: '12,500 points', value_estimate: null });
  });

  describe('card alerts', () => {
    const alert = (status: 'approved' | 'pending' | 'declined' | 'reversed' | null, total: number | null = 144.51) =>
      email({
        kind: 'card_alert',
        merchant: 'Uber Eats',
        receipt: {
          total, currency: 'TTD', purchase_type: 'food_delivery', travel_date: null, purchase_date: null, card_last_four: '0000',
          order_number: null, return_by: null, return_window_days: null, items: [], alert_status: status,
        },
      });

    it('becomes a purchase on the card, dated today when the alert has no date, with no return window', () => {
      const rows = toRows(alert('pending'), TODAY);
      expect(rows.receipt).toMatchObject({ kind: 'card_alert', pending: true, merchant: 'Uber Eats', total: 144.51, currency: 'TTD', last_four: '0000', purchase_date: TODAY });
      expect(rows.opportunities).toHaveLength(0);
    });
    it('marks settled charges as not pending', () => {
      expect(toRows(alert('approved'), TODAY).receipt?.pending).toBe(false);
    });
    it('ignores declined and reversed charges, and alerts without an amount', () => {
      expect(toRows(alert('declined'), TODAY).receipt).toBeNull();
      expect(toRows(alert('reversed'), TODAY).receipt).toBeNull();
      expect(toRows(alert('approved', null), TODAY).receipt).toBeNull();
    });
  });
});

describe('travel credits and certificates', () => {
  const dot = { how_to: 'Decline the rebooking or credit if you want the money back.', url: 'https://www.transportation.gov/individuals/aviation-consumer-protection/refunds' };

  it('counts a travel credit as money you have, with its number and use-by date', () => {
    const { opportunities } = toRows(
      email({ kind: 'other', merchant: 'Delta', offers: [offer({ type: 'travel_credit', title: 'eCredit', amount: 212.4, currency: 'USD', code: 'EC-0062', expires_on: '2027-03-03' })] }),
      TODAY,
    );
    expect(opportunities[0]).toMatchObject({ type: 'travel_credit', value_estimate: 212.4, code: 'EC-0062', expires_at: '2027-03-03T23:59:59Z' });
    expect(opportunities[0]!.action_steps.map((s) => s.step).join(' ')).toContain('EC-0062');
  });

  it('points US travellers to the cash-refund rule when the airline cancelled', () => {
    const e = email({ kind: 'other', merchant: 'Delta', offers: [offer({ type: 'travel_credit', title: 'Flight credit', amount: 300, expires_on: '2027-01-01', after_cancellation: true })] });
    const withRule = toRows(e, TODAY, 'USD', dot).opportunities[0]!;
    expect(withRule.action_steps.some((s) => s.url === dot.url && /cash refund/.test(s.step))).toBe(true);
    // No rule passed (not a US user): no claim about US rules.
    expect(toRows(e, TODAY).opportunities[0]!.action_steps.some((s) => /cash refund/.test(s.step))).toBe(false);
    // Not after a cancellation: no refund note.
    const plain = email({ kind: 'other', merchant: 'Delta', offers: [offer({ type: 'travel_credit', title: 'Flight credit', amount: 300, expires_on: '2027-01-01', after_cancellation: false })] });
    expect(toRows(plain, TODAY, 'USD', dot).opportunities[0]!.action_steps.some((s) => /cash refund/.test(s.step))).toBe(false);
  });

  it('keeps a certificate without inventing a dollar value', () => {
    const { opportunities } = toRows(
      email({ kind: 'loyalty', merchant: 'Marriott Bonvoy', offers: [offer({ type: 'certificate', title: 'Free night award (up to 35,000 points)', expires_on: '2027-06-30' })] }),
      TODAY,
    );
    expect(opportunities[0]).toMatchObject({ type: 'certificate', value_estimate: null, expires_at: '2027-06-30T23:59:59Z' });
  });
});

describe('offers that are not money owed', () => {
  it('leaves out trade-ins, and never counts "up to" amounts or rewards for doing something', () => {
    const { opportunities, skipped } = toRows(
      email({
        merchant: 'Apple',
        offers: [
          offer({ title: 'Get up to $1,200 in credit when you trade in your iPhone', amount: 1200, expires_on: '2026-12-31' }),
          offer({ title: 'Trade-in credit', amount: 650, details: 'With an eligible trade-in', expires_on: '2026-12-31' }),
          offer({ title: 'Up to 40% off your next order', percent_off: 40, expires_on: '2026-12-31' }),
          offer({ type: 'gift_card', title: '$100 Visa gift card for a case study interview', amount: 100, expires_on: '2026-12-31' }),
          offer({ title: '$20 off your next order', amount: 20, details: 'Unlock by completing 5 tasks', expires_on: '2026-12-31' }),
          offer({ title: '$20 off your order', amount: 20, code: 'SAVE20' }),
        ],
      }),
      TODAY,
    );
    expect(opportunities.map((o) => [o.title, o.value_estimate])).toEqual([
      ['Up to 40% off your next order', null],
      ['$20 off your next order', null],
      ['$20 off your order', 20],
    ]);
    // The trade-in and the interview gift card aren't perks: left out.
    expect(skipped).toEqual({ expired: 0, noValue: 0, notMoney: 3 });
  });
});

describe('readNote', () => {
  it('says why an email gave nothing new', () => {
    expect(readNote({ created: 0, duplicates: 1, expired: 0, noValue: 0, notMoney: 0 })).toBe('Already found in an earlier email');
    expect(readNote({ created: 0, duplicates: 0, expired: 1, noValue: 0, notMoney: 0 })).toBe('Expired before it arrived');
    expect(readNote({ created: 0, duplicates: 0, expired: 0, noValue: 1, notMoney: 0 })).toBe('An offer with no code, amount or end date to act on');
    expect(readNote({ created: 0, duplicates: 0, expired: 0, noValue: 0, notMoney: 1 })).toMatch(/trade-in/);
    expect(readNote({ created: 1, duplicates: 2, expired: 1, noValue: 0, notMoney: 0 })).toBe('2 already found in earlier emails · 1 expired before it arrived');
    expect(readNote({ created: 2, duplicates: 0, expired: 0, noValue: 0, notMoney: 0 })).toBeNull();
  });
});

describe('offerWords', () => {
  const o = (title: string, percent_off: number | null = null, amount: number | null = null) => ({ title, percent_off, amount });
  it('sees the same offer worded differently as one', () => {
    const a = offerWords(o('30% off select fresh groceries every Tuesday (Uber One)', 30));
    expect(offerWords(o('30% off select fresh groceries on Tuesdays', 30))).toBe(a);
    expect(offerWords(o('Weekly 30% off select fresh groceries for Uber One members', 30))).toBe(a);
  });
  it('keeps different offers apart', () => {
    expect(offerWords(o('30% off sweetgreen items', 30))).not.toBe(offerWords(o('30% off Hershey’s Halloween candy', 30)));
    expect(offerWords(o('$5 off at Burger King', null, 5))).not.toBe(offerWords(o('$5 off at Shake Shack', null, 5)));
    expect(offerWords(o('$5 off at Burger King', null, 5))).not.toBe(offerWords(o('$7 off at Burger King', null, 7)));
  });
});
