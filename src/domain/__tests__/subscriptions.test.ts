import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { membershipHints, payingTwice, recentCharges, serviceOf } from '../subscriptions';
import type { CardBenefit } from '../types';

// The real catalogs, so "included" and credit rules are tested against what users actually get.
const read = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../seed', f), 'utf8')) as { cards: { id: string; kind?: string; benefits: CardBenefit[] }[] };
const catalog = [...read('card_benefits.json').cards, ...read('memberships.json').cards];
const benefits = catalog.flatMap((c) => c.benefits.map((b) => ({ ...b, card_id: c.id })));
const cards = catalog.map((c) => ({ id: c.id, kind: (c.kind ?? 'card') as 'card' | 'membership' }));
const label = (id: string) => ({ w: 'Walmart+', p: 'Amex Platinum ·· 1001', s: "Sam's Club Plus", t: 'T-Mobile Experience Beyond' })[id] ?? id;

const receipt = (merchant: string, total: number, date = '2026-10-03', card: string | null = null) =>
  ({ merchant, total, currency: 'USD', purchase_date: date, matched_user_card_id: card });

describe('subscription charges', () => {
  it('knows services however the charge is written', () => {
    expect(serviceOf('PEACOCK TV')?.key).toBe('peacock');
    expect(serviceOf('Paramount+')?.key).toBe('paramount');
    expect(serviceOf('Walmart Plus')?.key).toBe('walmart_plus');
    expect(serviceOf('NETFLIX.COM')?.key).toBe('netflix');
    expect(serviceOf('Target')).toBeNull();
    expect(serviceOf('Clearwater Grill')).toBeNull();
  });

  it('keeps the latest charge per service, recent ones only', () => {
    const r = recentCharges([receipt('Peacock', 7.99, '2026-09-03'), receipt('Peacock', 7.99, '2026-10-03'), receipt('Netflix', 15.49, '2026-01-01'), receipt('Target', 40)], '2026-08-25');
    expect(r.map((c) => [c.service.key, c.date])).toEqual([['peacock', '2026-10-03']]);
  });
});

describe('payingTwice', () => {
  it('spots a subscription a membership already includes', () => {
    const r = payingTwice(recentCharges([receipt('Peacock', 7.99)], '2026-09-01'), [{ id: 'w', card_id: 'walmart_plus' }], benefits, label);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ saving: 7.99, covers: [{ by: 'Walmart+', kind: 'included' }] });
  });

  it('counts a card credit up to one month of it, and not when that card already paid', () => {
    const charges = recentCharges([receipt('Hulu', 18.99)], '2026-09-01');
    const viaOther = payingTwice(charges, [{ id: 'p', card_id: 'amex_platinum' }], benefits, label);
    expect(viaOther[0]).toMatchObject({ saving: 18.99, covers: [{ kind: 'credit', by: 'Amex Platinum ·· 1001', enroll: true }] });
    const big = payingTwice(recentCharges([receipt('YouTube TV', 82.99)], '2026-09-01'), [{ id: 'p', card_id: 'amex_platinum' }], benefits, label);
    expect(big[0]!.saving).toBe(25); // the credit is up to $25 a month
    const already = payingTwice(recentCharges([receipt('Hulu', 18.99, '2026-10-03', 'p')], '2026-09-01'), [{ id: 'p', card_id: 'amex_platinum' }], benefits, label);
    expect(already).toEqual([]);
  });

  it('catches paying for Walmart+ when Sam’s Club Plus includes it, but not the membership itself', () => {
    const charges = recentCharges([receipt('Walmart+', 12.95)], '2026-09-01');
    expect(payingTwice(charges, [{ id: 's', card_id: 'sams_club_plus' }], benefits, label)[0]!.covers[0]).toMatchObject({ by: "Sam's Club Plus", kind: 'included' });
    expect(payingTwice(charges, [{ id: 'w', card_id: 'walmart_plus' }], benefits, label)).toEqual([]);
  });

  it('says nothing when nothing you have covers it', () => {
    expect(payingTwice(recentCharges([receipt('Netflix', 15.49)], '2026-09-01'), [{ id: 'w', card_id: 'walmart_plus' }], benefits, label)).toEqual([]);
    expect(payingTwice(recentCharges([receipt('Netflix', 15.49)], '2026-09-01'), [{ id: 't', card_id: 'tmobile_experience_beyond' }], benefits, label)[0]!.covers[0]!.kind).toBe('included');
  });
});

describe('membershipHints', () => {
  it('suggests memberships you pay for but haven’t added', () => {
    const charges = recentCharges([receipt('Walmart+', 12.95), receipt('Uber One', 9.99), receipt('Peacock', 7.99)], '2026-01-01');
    expect(membershipHints(charges, [{ card_id: 'uber_one' }], cards).map((h) => h.membershipId)).toEqual(['walmart_plus']);
  });
});

describe('membershipsSeen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { membershipsSeen } = require('../subscriptions');
  const catalog = [
    { id: 'uber_one', kind: 'membership', product_name: 'Uber One' },
    { id: 'amazon_prime', kind: 'membership', product_name: 'Amazon Prime' },
    { id: 'dashpass', kind: 'membership', product_name: 'DashPass' },
  ];
  it('suggests a membership the email keeps treating you as a member of', () => {
    const emails = [
      { summary: 'Uber Eats marketing: $0 delivery fee for Uber One members', date: '2026-10-20T10:00:00Z' },
      { summary: '30% off select fresh groceries every Tuesday', membership: 'Uber One', date: '2026-10-22T10:00:00Z' },
      { summary: 'Try DashPass free for 30 days', date: '2026-10-21T10:00:00Z' },
      { summary: 'Join Prime today', date: '2026-10-21T10:00:00Z' },
      { summary: 'Your Prime benefits this month', date: '2026-10-23T10:00:00Z' },
    ];
    expect(membershipsSeen(emails, [], catalog)).toEqual([{ membershipId: 'uber_one', name: 'Uber One', lastCharged: '2026-10-22', source: 'email' }]);
    expect(membershipsSeen(emails, [{ card_id: 'uber_one' }], catalog)).toEqual([]);
  });
});
