import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { programFileSchema } from '../catalogSchema';
import { perkInterests, perksForYou, type ForYouInput } from '../forYou';
import type { Program } from '../programs';
import type { CardBenefit } from '../types';

const read = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../seed', f), 'utf8'));
const catalog: Program[] = programFileSchema.parse(read('programs.json')).programs.map((p, i) => ({ ...p, sort_order: i }));
const memberships = read('memberships.json') as { cards: { id: string; product_name: string; benefits: CardBenefit[] }[] };

const base: ForYouInput = {
  programs: catalog,
  ownPerks: [],
  country: 'US',
  isStudent: false,
  picked: [],
  inferred: [],
  shops: new Set(),
  follows: new Set(),
  issuers: [],
  feedback: new Map(),
};
const ids = (d: Partial<ForYouInput>) => perksForYou({ ...base, ...d }).map((i) => i.key);

describe('perksForYou with the real catalog', () => {
  it('ranks a store you shop at, with its reason, above perks you only might like', () => {
    const items = perksForYou({ ...base, picked: ['beauty'], shops: new Set(['sephora']) });
    expect(items[0]).toMatchObject({ key: 'program:sephora_beauty_insider', group: 'claim', why: ['You shop at Sephora', 'You’re into beauty'] });
    // Ulta is beauty too, but you don't shop there: it needs a personal reason, which the interest gives.
    expect(items.find((i) => i.key === 'program:ulta_beauty_rewards')?.why).toEqual(['You’re into beauty']);
    expect(items.findIndex((i) => i.key === 'program:ulta_beauty_rewards')).toBeGreaterThan(0);
  });

  it('shows store programs only to people who use the store', () => {
    expect(ids({})).not.toContain('program:chipotle_rewards');
    expect(ids({ follows: new Set(['chipotle']) })).toContain('program:chipotle_rewards');
    expect(perksForYou({ ...base, follows: new Set(['chipotle']) }).find((i) => i.key === 'program:chipotle_rewards')?.why).toEqual(['Chipotle emails you']);
  });

  it('gives issuer perks only to people with a card from that bank, matched by whole words', () => {
    expect(ids({})).not.toContain('program:bofa_museums_on_us');
    const bofa = perksForYou({ ...base, issuers: ['Bank of America'] }).find((i) => i.key === 'program:bofa_museums_on_us');
    expect(bofa).toMatchObject({ group: 'yours', why: ['You have a Bank of America card'] });
    expect(ids({ issuers: ['American Express', 'Chase'] })).toEqual(expect.arrayContaining(['program:amex_offers', 'program:chase_offers']));
    expect(perksForYou({ ...base, issuers: ['American Express'] }).find((i) => i.key === 'program:amex_offers')?.why).toEqual(['You have an American Express card']);
    expect(ids({ issuers: ['First Citizens (Trinidad & Tobago)'], country: 'TT' })).not.toContain('program:citi_merchant_offers');
  });

  it('keeps to where you live', () => {
    const tt = ids({ country: 'TT', shops: new Set(['sephora', 'marriott']) });
    expect(tt).not.toContain('program:sephora_beauty_insider');
    expect(tt).not.toContain('program:us_missing_money');
    expect(tt).toEqual(expect.arrayContaining(['program:marriott_bonvoy', 'program:tt_unclaimed_securities', 'program:nalis']));
  });

  it('shows general programs to everyone, and interest-only ones until it knows what you like', () => {
    const fresh = ids({});
    expect(fresh).toEqual(expect.arrayContaining(['program:us_missing_money', 'program:irs_free_file', 'program:nps_fee_free_days', 'program:kanopy']));
    // Once PerkScan knows you're into beauty and food, park passes and streaming need a matching interest.
    const known = ids({ picked: ['beauty', 'dining'] });
    expect(known).not.toContain('program:nps_fee_free_days');
    expect(known).toContain('program:irs_free_file');
    expect(ids({ picked: ['travel'] })).toContain('program:nps_fee_free_days');
  });

  it('weighs interests you picked above ones your receipts suggest', () => {
    const items = perksForYou({ ...base, picked: ['beauty'], inferred: ['entertainment'] });
    const ulta = items.find((i) => i.key === 'program:ulta_beauty_rewards')!;
    const amc = items.find((i) => i.key === 'program:amc_stubs_insider')!;
    expect(ulta.why).toEqual(['You’re into beauty']);
    expect(amc.why).toEqual(['You spend on movies & fun']);
    expect(ulta.score).toBeGreaterThan(amc.score);
  });

  it('never gives “everything else” as a reason', () => {
    expect(ids({ inferred: ['shopping'] })).not.toContain('program:target_circle');
    expect(ids({ inferred: ['shopping'], shops: new Set(['target']) })).toContain('program:target_circle');
  });

  it('drops what you said you have or don’t want, and anything not verified', () => {
    const feedback = new Map([['us_missing_money', 'have' as const], ['irs_free_file', 'dismissed' as const]]);
    const out = ids({ feedback });
    expect(out).not.toContain('program:us_missing_money');
    expect(out).not.toContain('program:irs_free_file');
    const unverified = catalog.filter((p) => p.status !== 'active').map((p) => `program:${p.id}`);
    for (const id of unverified) expect(ids({ shops: new Set(catalog.flatMap((p) => p.merchants)) })).not.toContain(id);
  });

  it('never suggests refund or deadline rules (the reader applies those)', () => {
    const all = perksForYou({ ...base, picked: ['travel'], shops: new Set(catalog.flatMap((p) => p.merchants)) });
    const kinds = new Set(all.map((i) => catalog.find((p) => `program:${p.id}` === i.key)?.kind));
    expect(kinds.has('refund_rule')).toBe(false);
    expect(kinds.has('deadline_rule')).toBe(false);
  });

  it('student-only programs need a student', () => {
    const student: Program = { ...catalog[0]!, id: 'x_student', kind: 'free_perk', merchants: [], issuers: [], interests: [], countries: [], student_only: true, status: 'active' };
    expect(ids({ programs: [student] })).toEqual([]);
    expect(perksForYou({ ...base, programs: [student], isStudent: true })[0]).toMatchObject({ group: 'yours', why: ['You’re a student'] });
  });
});

describe('your own card and membership perks', () => {
  const prime = memberships.cards.find((c) => c.id === 'amazon_prime')!;
  const ownPerks = prime.benefits.map((benefit) => ({ benefit, by: 'Amazon Prime' }));

  it('shows the ones that match what you’re into, saying which membership they come with', () => {
    const items = perksForYou({ ...base, programs: [], ownPerks, picked: ['groceries'] });
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(i).toMatchObject({ group: 'yours', from: 'Amazon Prime', why: ['Comes with your Amazon Prime', 'You’re into groceries'] });
  });

  it('shows all of them, lower down, until interests are known', () => {
    const items = perksForYou({ ...base, programs: [], ownPerks });
    expect(items).toHaveLength(prime.benefits.filter((b) => b.type === 'perk' && b.status === 'active').length);
    expect(items[0]!.why).toEqual(['Comes with your Amazon Prime']);
  });
});

describe('perkInterests', () => {
  it('reads what a perk is about from its name', () => {
    expect(perkInterests('Priority Pass lounge access')).toEqual(['travel']);
    expect(perkInterests('DashPass membership')).toEqual(['delivery']);
    expect(perkInterests('Fuel savings: 10¢ off per gallon')).toEqual(['fuel']);
    expect(perkInterests('Cell phone protection')).toEqual(['electronics']);
    expect(perkInterests('Annual fee')).toEqual([]);
  });
});
