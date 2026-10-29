import { scanLines, type ScanInput } from '../scan';
import type { EarnPick } from '../earn';

const pick = (label: string) => ({ label } as EarnPick);
const empty: ScanInput = {
  owed: { items: [], total: {}, count: 0 },
  creditsOpen: { total: 0, count: 0 },
  payingTwice: [],
  missed: { total: 0, count: 0, biggest: null },
  memberships: [],
  spottedCards: 0,
  subscriptions: { count: 0, yearly: 0 },
  currency: 'USD',
};

describe('scanLines', () => {
  it('heads with money you can still get, and shows the wrong-card cost without adding it in', () => {
    const r = scanLines({
      ...empty,
      owed: { items: [], total: { USD: 70 }, count: 1 },
      creditsOpen: { total: 27, count: 3 },
      payingTwice: [{ charge: { service: { key: 'hulu', name: 'Hulu', match: /hulu/ }, amount: 9.99, currency: 'USD', date: '2026-10-01', userCardId: null }, covers: [], saving: 9.99 }],
      missed: { total: 12.4, count: 9, biggest: { merchant: 'Chipotle', date: '2026-10-01', used: pick('2x points'), best: pick('4x points'), extra: 1.2 } },
      memberships: [{ membershipId: 'uber_one', name: 'Uber One', lastCharged: '2026-10-01', source: 'charge' }],
      spottedCards: 1,
      subscriptions: { count: 4, yearly: 431.6 },
    });
    expect(r.total).toBe(106.99);
    expect(r.lines.map((l) => [l.key, l.title, l.counts])).toEqual([
      ['owed', '$70 owed to you', true],
      ['credits', '$27 in card credits to use', true],
      ['twice', '$9.99 you’re paying twice', true],
      ['missed', '$12.40 more with the right card', false],
      ['memberships', 'You pay for Uber One', false],
      ['cards', '1 card found in your bank', false],
      ['subscriptions', '4 subscriptions, $432 a year', false],
    ]);
    expect(r.lines.find((l) => l.key === 'cards')!.detail).toBe('Add it to unlock its credits and protections.');
    expect(r.lines.find((l) => l.key === 'missed')!.detail).toBe('On 9 purchases in the last 90 days. Biggest: Chipotle, where another card earns 4x points. Before you pay shows which to use.');
  });

  it('is empty when there is nothing, and names refunds with no amount', () => {
    expect(scanLines(empty)).toEqual({ lines: [], total: 0 });
    expect(scanLines({ ...empty, owed: { items: [], total: { EUR: 0 }, count: 1 } }).lines[0]!.title).toBe('1 refund owed to you');
  });
});
