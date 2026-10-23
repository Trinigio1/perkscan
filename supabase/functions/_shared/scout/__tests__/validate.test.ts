import type { Found } from '../extract.ts';
import { checkFound, norm, numbersIn, statesDate, type SourceIn } from '../validate.ts';

const TODAY = '2026-10-23';
const source: SourceIn = {
  id: 'courts_tt', name: 'Courts', kind: 'store', url: 'https://www.courts.co.tt/promotions', countries: ['TT'], regions: [],
  categories: ['home'], merchants: ['courts'], issuers: [], card_keywords: [],
};
const PAGE = `Divali Deals
Save TT$300 off all refrigerators until October 31st, 2026. Use code DIVALI300 at checkout.
Minimum spend TT$2,000.
Free delivery on mattresses this weekend.
See details (https://www.courts.co.tt/divali)
Great savings storewide!`;

const found = (f: Partial<Found>): Found => ({
  title: 'TT$300 off refrigerators', summary: 'Use code DIVALI300 on fridges.', category: 'home', event_kind: null,
  amount: 300, percent_off: null, currency: 'TTD', code: 'DIVALI300', min_spend: 2000, starts_on: null, ends_on: '2026-10-31',
  link: 'https://www.courts.co.tt/divali',
  evidence: 'Save TT$300 off all refrigerators until October 31st, 2026. Use code DIVALI300 at checkout.', ...f,
});
const check = (f: Partial<Found>, page = PAGE, s = source) => checkFound(found(f), { page, source: s, today: TODAY, defaultCurrency: 'TTD' });

describe('checkFound', () => {
  it('keeps a deal whose every detail is on the page', () => {
    const r = check({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ amount: 300, code: 'DIVALI300', ends_on: '2026-10-31', min_spend: 2000, url: 'https://www.courts.co.tt/divali', confidence: 'confirmed' });
  });

  it('drops quotes that aren’t on the page', () => {
    expect(check({ evidence: 'Save TT$500 off all refrigerators until October 31st.' })).toEqual({ ok: false, reason: 'evidence not on page' });
  });

  it('drops headlines with numbers the quote doesn’t back up', () => {
    expect(check({ title: 'TT$500 off refrigerators' })).toEqual({ ok: false, reason: 'headline number not in evidence' });
  });

  it('removes details it can’t find instead of trusting them', () => {
    const r = check({ code: 'FAKE10', ends_on: '2026-11-15', min_spend: 999 });
    expect(r.ok && r.value).toMatchObject({ amount: 300, code: null, ends_on: null, min_spend: null });
  });

  it('drops things that already ended', () => {
    const page = 'Back to school: 20% off backpacks until October 1, 2026.';
    expect(check({ title: '20% off backpacks', amount: null, code: null, percent_off: 20, ends_on: '2026-10-01', evidence: page, min_spend: null }, page)).toEqual({ ok: false, reason: 'already ended' });
  });

  it('drops vague marketing with nothing concrete', () => {
    expect(check({ title: 'Great savings', amount: null, code: null, ends_on: null, min_spend: null, evidence: 'Great savings storewide!' })).toEqual({ ok: false, reason: 'nothing concrete' });
  });

  it('keeps "free" offers but marks them to check', () => {
    const r = check({ title: 'Free mattress delivery', amount: null, code: null, ends_on: null, min_spend: null, evidence: 'Free delivery on mattresses this weekend.' });
    expect(r.ok && r.value.confidence).toBe('check');
  });

  it('only links to the store’s own site', () => {
    const r = check({ link: 'https://evil.example/divali' });
    expect(r.ok && r.value.url).toBe(source.url);
  });

  it('needs an end date for bank promotions', () => {
    const bank = { ...source, kind: 'bank' as const };
    expect(check({ ends_on: null }, PAGE, bank)).toEqual({ ok: false, reason: 'event without a stated end date' });
    expect(check({}, PAGE, bank).ok).toBe(true);
  });

  it('keeps the same key for the same promotion', () => {
    const a = check({});
    const b = check({ summary: 'Different words' });
    expect(a.ok && b.ok && a.value.key === b.value.key).toBe(true);
  });
});

describe('helpers', () => {
  it('reads numbers as written', () => {
    expect(numbersIn('TT$1,299.99 or 20% off 3 items')).toEqual([1299.99, 20, 3]);
  });
  it('matches faithful quotes despite curly quotes and spacing', () => {
    expect(norm('Don’t   miss — it')).toBe("don't miss - it");
  });
  it.each([
    ['Ends Oct 31', true],
    ['until 31st October 2026', true],
    ['valid to 31/10/2026', true],
    ['valid to 10/31', true],
    ['2026-10-31', true],
    ['Ends Oct 30', false],
    ['Oct. 31', true],
    ['31st of October', true],
    ['October sale, 31 items', false],
  ])('statesDate(%s)', (text, ok) => expect(statesDate(text, '2026-10-31')).toBe(ok));
});
