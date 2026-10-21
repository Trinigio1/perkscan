import { scoreCase, summarize, type Expected } from '../score';
import type { ParsedEmail } from '../../supabase/functions/_shared/inbox/schema';

const parsed = (p: Partial<ParsedEmail>): ParsedEmail => ({ kind: 'promo', merchant: 'Acme', summary: '', receipt: null, offers: [], ...p });
const offer = (o: Partial<ParsedEmail['offers'][number]>): ParsedEmail['offers'][number] => ({
  type: 'promo', currency: 'USD', title: 'Deal', amount: null, percent_off: null, code: null, expires_on: null,
  min_spend: null, points: null, claim_url: null, details: null, ...o,
});

describe('scoreCase', () => {
  const expected: Expected = { kind: 'promo', merchant: 'Acme Outfitters', offers: [{ type: 'promo', code: 'SPRING20', expires_on: '2026-04-30' }] };

  it('passes when every listed field matches', () => {
    const checks = scoreCase(expected, parsed({ merchant: 'ACME OUTFITTERS', offers: [offer({ code: 'spring20', expires_on: '2026-04-30' })] }));
    expect(checks.every((c) => c.ok)).toBe(true);
  });
  it('flags a wrong date, a missed offer and an invented one', () => {
    const checks = scoreCase(
      { ...expected, offers: [...expected.offers!, { type: 'gift_card', amount: 5 }] },
      parsed({ offers: [offer({ code: 'SPRING20', expires_on: '2026-04-29' }), offer({ type: 'points', title: 'Bonus points' })] }),
    );
    expect(checks.filter((c) => !c.ok).map((c) => c.field).sort()).toEqual(['offers.expiry', 'offers.extra', 'offers.missed']);
  });
  it('checks card alerts field by field', () => {
    const checks = scoreCase(
      { kind: 'card_alert', merchant: 'Uber Eats', receipt: { total: 144.51, currency: 'TTD', card_last_four: '0000', alert_status: 'pending' } },
      parsed({
        kind: 'card_alert', merchant: 'Uber Eats',
        receipt: { total: 144.51, currency: 'USD', purchase_type: 'food_delivery', travel_date: null, purchase_date: null, card_last_four: '0000', order_number: null, return_by: null, return_window_days: null, items: [], alert_status: 'pending' },
      }),
    );
    expect(checks.filter((c) => !c.ok).map((c) => c.field)).toEqual(['receipt.currency']);
  });
});

describe('summarize', () => {
  it('counts fully-right cases and per-field accuracy, worst first', () => {
    const s = summarize([
      { name: 'a', checks: [{ field: 'kind', ok: true, expected: 1, actual: 1 }, { field: 'offers.code', ok: false, expected: 1, actual: 2 }] },
      { name: 'b', checks: [{ field: 'kind', ok: true, expected: 1, actual: 1 }] },
      { name: 'c', checks: null },
    ]);
    expect(s.casesRight).toBe(1);
    expect(s.fields[0]).toEqual({ field: 'offers.code', right: 0, total: 1 });
    expect(s.fields.find((f) => f.field === 'parse_failed')).toEqual({ field: 'parse_failed', right: 0, total: 1 });
  });
});
