import { opp, rec } from '../__fixtures__/opportunities';
import { planRecapMoment, savedBySource, sourceLine, spottedOnReceipts } from '../proof';

const OCT = new Date(2026, 9, 1);
const NOV = new Date(2026, 10, 1);
const opps = [
  opp({ id: 'uber', type: 'card_credit' }),
  opp({ id: 'dunkin', type: 'card_credit' }),
  opp({ id: 'eats', type: 'promo' }),
  opp({ id: 'flight', type: 'refund' }),
];
const recovered = [
  rec('uber', 10, '2026-10-03T12:00:00'),
  rec('dunkin', 7, '2026-10-09T12:00:00'),
  rec('eats', 6.2, '2026-10-12T12:00:00'),
  rec('flight', 669.23, '2026-10-20T12:00:00'),
  rec('uber', 10, '2026-09-03T12:00:00'), // last month
  { id: 'm', opportunity_id: null, amount: 25, currency: 'USD', recovered_at: '2026-10-15T12:00:00' },
];

describe('savedBySource', () => {
  it('adds up what came back this month by where it came from, biggest first', () => {
    const lines = savedBySource(opps, recovered, OCT, NOV);
    expect(lines.map((l) => [l.label, l.total, l.count])).toEqual([
      ['Refunds', { USD: 669.23 }, 1],
      ['Added by you', { USD: 25 }, 1],
      ['Card credits', { USD: 17 }, 2],
      ['Codes', { USD: 6.2 }, 1],
    ]);
    expect(sourceLine(lines.slice(0, 2), 'USD')).toBe('Refunds $669.23 · Added by you $25');
  });

  it('counts what PerkScan spotted on receipts by itself', () => {
    expect(spottedOnReceipts([{ marked_by: 'auto', recovered_at: '2026-10-05T00:00:00' }, { marked_by: 'user', recovered_at: '2026-10-05T00:00:00' }, { marked_by: 'auto', recovered_at: '2026-09-05T00:00:00' }], OCT, NOV)).toBe(1);
  });
});

describe('planRecapMoment', () => {
  it('sends last month’s recap on the 1st, only when something came back', () => {
    const m = planRecapMoment(opps, recovered, new Date(2026, 9, 22), 'USD')!;
    expect(m.id).toBe('recap-2026-10');
    expect(m.fireAt).toEqual(new Date(2026, 10, 1, 9));
    expect(m.title).toBe('Your October recap: at least $717.43 back');
    expect(m.body).toBe('Refunds $669.23 · Added by you $25 · Card credits $17. Tap to see where it came from.');
    expect(m.route).toBe('/recap?offset=-1');
    expect(planRecapMoment(opps, [], new Date(2026, 9, 22), 'USD')).toBeNull();
  });
});
