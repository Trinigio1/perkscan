import { toRows } from '../opportunities.ts';
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
    expect(opportunities[0]).toMatchObject({ type: 'promo', value_estimate: 20, code: 'SAVE20', expires_at: '2026-04-30T23:59:59Z', dedupe_key: 'promo:acme:save20:2026-04-30' });
    expect(opportunities[0]!.action_steps.map((s) => s.step).join(' ')).toContain('SAVE20');
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
