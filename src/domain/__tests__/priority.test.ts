import type { Deal } from '../deals';
import type { LocalEvent } from '../events';
import { actNow, effortOf, priorityScore, urgencyPoints, valuePoints } from '../priority';
import { opp } from '../__fixtures__/opportunities';

const NOW = new Date('2026-10-25T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const deal = (d: Partial<Deal>): Deal => ({
  id: 'd', source: 'official', merchant: 'Target', merchant_keys: ['target'], title: '20% off', summary: null, category: 'shopping', amount: null, percent_off: 20,
  currency: 'USD', code: null, min_spend: null, countries: ['US'], regions: [], starts_on: null, ends_on: null, url: 'https://target.com', evidence: 'x',
  confidence: 'confirmed', seen_by: 0, saves: 0, ...d,
});
const event = (e: Partial<LocalEvent>): LocalEvent => ({
  id: 'e', title: 'Tax-free weekend', summary: '', category: 'sale', countries: ['US'], regions: [], issuers: [], card_keywords: [],
  starts_on: '2026-10-27', ends_on: '2026-10-28', url: 'https://x.gov', status: 'confirmed', based_on: null, last_verified: '2026-10-01', ...e,
});
const input = (over: Partial<Parameters<typeof actNow>[0]> = {}) => ({ opportunities: [], recoveredByOpp: new Map<string, number>(), offers: [], events: [], ...over });

describe('priorityScore', () => {
  it('values urgency, then money, then ease, scaled by how sure PerkScan is', () => {
    expect(urgencyPoints(new Date(days(0.5)), NOW)).toBeGreaterThan(urgencyPoints(new Date(days(5)), NOW));
    expect(urgencyPoints(new Date(days(-1)), NOW)).toBe(0);
    expect(urgencyPoints(null, NOW)).toBe(0);
    expect(valuePoints(100)).toBeGreaterThan(valuePoints(10));
    expect(valuePoints(1_000_000)).toBe(30);
    const base = { value: 50, deadline: new Date(days(2)), effort: 'tap' as const };
    expect(priorityScore({ ...base, confidence: 'confirmed' }, NOW)).toBeGreaterThan(priorityScore({ ...base, confidence: 'check' }, NOW));
    expect(priorityScore({ ...base, confidence: 'confirmed' }, NOW)).toBeGreaterThan(priorityScore({ ...base, effort: 'form', confidence: 'confirmed' }, NOW));
  });

  it('knows what takes more than a tap', () => {
    expect(effortOf({ type: 'promo' })).toBe('tap');
    expect(effortOf({ type: 'refund' })).toBe('request');
    expect(effortOf({ type: 'settlement' })).toBe('form');
  });
});

describe('actNow', () => {
  it('puts a small amount about to expire above a bigger one months away', () => {
    const soon = opp({ value_estimate: 15, expires_at: days(2) });
    const later = opp({ value_estimate: 300, expires_at: days(200) });
    const r = actNow(input({ opportunities: [later, soon] }), NOW);
    expect(r.map((x) => (x.kind === 'item' ? x.opp.id : x.kind))).toEqual([soon.id, later.id]);
  });

  it('leaves out protections, used credits, claims already started, far-off return windows and expired items', () => {
    const used = opp({ value_estimate: 10, expires_at: days(3) });
    const list = [
      opp({ type: 'protection', category: 'card_protections', value_estimate: null, expires_at: days(20) }),
      used,
      opp({ type: 'refund', category: 'refunds', value_estimate: 40, claim_started_at: days(-2) }),
      opp({ type: 'return_window', category: 'returns_trials', value_estimate: null, expires_at: days(20) }),
      opp({ value_estimate: 10, expires_at: days(-1) }),
    ];
    expect(actNow(input({ opportunities: list, recoveredByOpp: new Map([[used.id, 10]]) }), NOW)).toEqual([]);
    const closing = opp({ type: 'return_window', category: 'returns_trials', value_estimate: null, expires_at: days(2) });
    expect(actNow(input({ opportunities: [closing] }), NOW).map((x) => x.kind)).toEqual(['item']);
  });

  it('only lets urgent offers and events in, below money that is already yours', () => {
    const credit = opp({ value_estimate: 20, expires_at: days(3) });
    const r = actNow(
      input({
        opportunities: [credit],
        offers: [
          { deal: deal({ id: 'ends_soon', amount: 20, ends_on: '2026-10-27' }), why: 'You shop at Target' },
          { deal: deal({ id: 'far', ends_on: '2026-12-20' }), why: 'You shop at Target' },
          { deal: deal({ id: 'no_end' }), why: 'You shop at Target' },
        ],
        events: [event({}), event({ id: 'far', starts_on: '2026-12-01', ends_on: '2026-12-03' })],
      }),
      NOW,
    );
    expect(r.map((x) => (x.kind === 'item' ? 'credit' : x.kind === 'offer' ? x.deal.id : x.event.id))).toEqual(['credit', 'ends_soon', 'e']);
  });

  it('keeps it short', () => {
    const many = Array.from({ length: 9 }, (_, i) => opp({ value_estimate: 10, expires_at: days(i + 1) }));
    expect(actNow(input({ opportunities: many }), NOW, 5)).toHaveLength(5);
  });
});
