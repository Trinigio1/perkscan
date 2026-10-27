import { opp } from '../__fixtures__/opportunities';
import { rankCompare } from '../confidence';
import { sumBags } from '../format';
import { nextToUse } from '../money';
import { groupByStore, isStale, isVagueElsewhere, relevance, STALE_DAYS, yourStores } from '../relevance';

const NOW = new Date('2026-10-27T12:00:00Z');
const promo = (o: Parameters<typeof opp>[0]) => opp({ type: 'promo', category: 'promos', user_card_id: null, benefit_id: null, value_estimate: null, ...o });
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe('old codes with no end date', () => {
  it('retire a month after their email was sent', () => {
    expect(isStale(promo({ title: 'VALENTINE10', sent_on: '2026-02-10T09:00:00Z' }), NOW)).toBe(true);
    expect(isStale(promo({ title: 'Fresh code', sent_on: daysAgo(STALE_DAYS - 5) }), NOW)).toBe(false);
  });
  it('use the email date, not when PerkScan saved it (a re-read saves old codes today)', () => {
    expect(isStale(promo({ sent_on: daysAgo(90), created_at: daysAgo(1) }), NOW)).toBe(true);
    expect(isStale(promo({ sent_on: null, created_at: daysAgo(90) }), NOW)).toBe(true);
  });
  it('never touch dated offers, gift cards, card credits, items added by hand or acted on', () => {
    const old = daysAgo(200);
    expect(isStale(promo({ sent_on: old, expires_at: '2026-12-01T00:00:00Z' }), NOW)).toBe(false);
    expect(isStale(opp({ type: 'store_credit', category: 'store_credit_gift_cards', user_card_id: null, sent_on: old }), NOW)).toBe(false);
    expect(isStale(opp({ sent_on: old }), NOW)).toBe(false);
    expect(isStale(promo({ sent_on: old, dedupe_key: 'manual:abc' }), NOW)).toBe(false);
    expect(isStale(promo({ sent_on: old, claim_started_at: daysAgo(2) }), NOW)).toBe(false);
  });
});

describe('what is yours', () => {
  const you = yourStores(
    [{ merchant: 'Uber Eats' }, { merchant: 'Amazon.com' }],
    [{ card_id: 'uber_one' }],
    [{ id: 'uber_one', kind: 'membership', issuer: 'Uber' }],
    ['fitness'],
  );
  it('puts stores you buy from and your cards first, then your interests, then the rest', () => {
    expect(relevance(promo({ merchant: 'Uber Eats', sender_domain: 'uber.com' }), you)).toBe(0);
    expect(relevance(promo({ merchant: 'Amazon', sender_domain: 'amazon.com' }), you)).toBe(0);
    expect(relevance(opp({}), you)).toBe(0); // a card credit
    expect(relevance(promo({ merchant: 'Alo Yoga', interest: 'fitness' }), you)).toBe(1);
    expect(relevance(promo({ merchant: 'SAVA Amsterdam', sender_domain: 'sava-amsterdam.com', interest: 'fashion' }), you)).toBe(2);
  });

  it('ranks your stores above a bigger offer from a store you never use', () => {
    const yours = promo({ merchant: 'Uber Eats', sender_domain: 'uber.com', percent_off: 15 });
    const theirs = promo({ merchant: 'Funded Trading Plus', percent_off: 35 });
    const sorted = [theirs, yours].sort(rankCompare(NOW, undefined, (o) => relevance(o, you)));
    expect(sorted[0]).toBe(yours);
  });
});

describe('ranking without a dollar figure', () => {
  it('puts the bigger percent off first', () => {
    const ten = promo({ title: '10% off with code APRIL10' });
    const thirty = promo({ title: '30% off all challenges' });
    expect([ten, thirty].sort(rankCompare(NOW))[0]).toBe(thirty);
  });
});

describe('one row per store', () => {
  it('folds a store’s codes under its best one and keeps everything else apart', () => {
    const a1 = promo({ merchant: 'Funded Trading Plus', title: '35% off' });
    const b1 = promo({ merchant: 'Uber Eats', sender_domain: 'uber.com' });
    const a2 = promo({ merchant: 'Funded Trading Plus', title: '10% off' });
    const credit1 = opp({ title: 'Airline credit' });
    const credit2 = opp({ title: 'Dining credit' });
    const groups = groupByStore([a1, b1, a2, credit1, credit2]);
    expect(groups.map((g) => [g.lead.id, g.more.map((m) => m.id)])).toEqual([
      [a1.id, [a2.id]],
      [b1.id, []],
      [credit1.id, []],
      [credit2.id, []],
    ]);
  });
  it('keys by store name, so one sender’s codes for several stores stay apart', () => {
    const lugg = promo({ merchant: 'Lugg', sender_domain: 'avalonbay.com' });
    const spa = promo({ merchant: 'Spa Week', sender_domain: 'avalonbay.com' });
    const sava = promo({ merchant: 'SAVA' });
    const sava2 = promo({ merchant: 'Sava Amsterdam' });
    expect(groupByStore([lugg, spa, sava, sava2]).map((g) => g.more.length)).toEqual([0, 0, 1]);
  });
  it('shows one thing per store under Use soon', () => {
    const soon = (title: string) => promo({ merchant: 'Uber Eats', sender_domain: 'uber.com', title, value_estimate: 5, expires_at: '2026-10-30T00:00:00Z' });
    const list = nextToUse([soon('A'), soon('B'), promo({ merchant: 'Target', value_estimate: 5, expires_at: '2026-10-31T00:00:00Z' })], NOW, 4);
    expect(list.map((o) => o.merchant)).toEqual(['Uber Eats', 'Target']);
  });
});

describe('save up to', () => {
  it('adds amounts per currency, never converting', () => {
    expect(sumBags({ USD: 290 }, { USD: 95.5 }, { TTD: 40 }, {})).toEqual({ USD: 385.5, TTD: 40 });
  });
});

describe('vague offers from stores you don’t use', () => {
  const you = yourStores([{ merchant: 'Uber Eats' }], [], [], ['fitness']);
  it('are hidden; the same from your own stores or interests stay to check', () => {
    expect(isVagueElsewhere(promo({ title: 'Factors.ai: save 25%', merchant: 'LinkedIn', sender_domain: 'linkedin.com' }), you)).toBe(true);
    expect(isVagueElsewhere(promo({ title: '30% off select fresh groceries', merchant: 'Uber Eats', sender_domain: 'uber.com' }), you)).toBe(false);
    expect(isVagueElsewhere(promo({ title: '20% off', merchant: 'Alo Yoga', interest: 'fitness' }), you)).toBe(false);
  });
  it('keep anything with a code or an amount, and anything you acted on', () => {
    expect(isVagueElsewhere(promo({ merchant: 'SAVA', code: 'FIRST' }), you)).toBe(false);
    expect(isVagueElsewhere(promo({ merchant: 'SAVA', value_estimate: 10 }), you)).toBe(false);
    expect(isVagueElsewhere(promo({ merchant: 'SAVA', claim_started_at: '2026-10-20T00:00:00Z' }), you)).toBe(false);
  });
});
