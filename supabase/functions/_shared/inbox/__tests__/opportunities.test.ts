import { readNote, toRows } from '../opportunities.ts';
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
    expect(opportunities[0]).toMatchObject({ type: 'promo', value_estimate: 20, code: 'SAVE20', expires_at: '2026-04-30T23:59:59Z', dedupe_key: 'promo:acme:save20:2026-04-30', min_spend: 100 });
    expect(opportunities[0]!.action_steps.map((s) => s.step).join(' ')).toContain('SAVE20');
  });

  it('tags every offer with what the email is about', () => {
    const { opportunities } = toRows(email({ merchant: 'Sephora', interest: 'beauty', offers: [offer({ type: 'promo', title: 'Free birthday gift', expires_on: '2026-04-30' })] }), TODAY);
    expect(opportunities[0]).toMatchObject({ interest: 'beauty', value_estimate: null });
    expect(toRows(email({ offers: [offer({ amount: 5, expires_on: '2026-04-30' })] }), TODAY).opportunities[0]!.interest).toBeNull();
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

  it('builds a receipt and a return-window reminder from a window in days', () => {
    const rows = toRows(
      email({
        kind: 'receipt',
        receipt: { total: 101.99, currency: 'USD', purchase_type: 'clothing', travel_date: null, purchase_date: '2026-04-05', card_last_four: '4242', order_number: 'A1', return_by: null, return_window_days: 30, items: [] },
      }),
      TODAY,
    );
    expect(rows.receipt).toMatchObject({ merchant: 'Acme', total: 101.99, last_four: '4242', return_by: '2026-05-05' });
    expect(rows.opportunities[0]).toMatchObject({ type: 'return_window', value_estimate: null, expires_at: '2026-05-05T23:59:59Z' });
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
      ['$100 Visa gift card for a case study interview', null],
      ['$20 off your next order', null],
      ['$20 off your order', 20],
    ]);
    expect(skipped).toEqual({ expired: 0, noValue: 0, notMoney: 2 });
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
