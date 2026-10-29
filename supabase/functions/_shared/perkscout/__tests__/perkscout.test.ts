import { checkPerkPage } from '../check';
import { bestPerkUrl } from '../find';
import type { PerkPage } from '../extract';

const PAGE = `Sweetgreen Rewards. Joining is free — download the app and sign up. Members get a free side on their birthday.
Earn 10 points for every $1 you spend. Get $5 off your first order when you join. Terms apply.`;

const program = (p: Partial<NonNullable<PerkPage['program']>>): PerkPage => ({
  program: {
    name: 'Sweetgreen Rewards',
    free_to_join: true,
    join_evidence: 'Joining is free — download the app and sign up.',
    how_to_join: 'Download the app and sign up.',
    perks: [{ title: 'Free birthday side', evidence: 'Members get a free side on their birthday.' }],
    ...p,
  },
});

describe('checkPerkPage', () => {
  it('publishes a free program whose perks are on the page', () => {
    const r = checkPerkPage(program({}), { page: PAGE, domain: 'sweetgreen.com' });
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Sweetgreen Rewards',
        summary: 'Free to join. Free birthday side.',
        how_to: 'Download the app and sign up.',
        evidence: 'Joining is free — download the app and sign up. … Members get a free side on their birthday.',
        hasMoney: false,
      },
    });
  });

  it('holds a program for review when a perk states a dollar amount', () => {
    const r = checkPerkPage(program({ perks: [{ title: '$5 off your first order', evidence: 'Get $5 off your first order when you join.' }] }), { page: PAGE, domain: 'sweetgreen.com' });
    expect(r.ok && r.value.hasMoney).toBe(true);
  });

  it('drops perks the page doesn’t back up, and numbers the quote doesn’t have', () => {
    const r = checkPerkPage(
      program({
        perks: [
          { title: 'Free dessert every month', evidence: 'Members get a free dessert every month.' }, // not on the page
          { title: '20 points per $1', evidence: 'Earn 10 points for every $1 you spend.' }, // 20 isn't in the quote
        ],
      }),
      { page: PAGE, domain: 'sweetgreen.com' },
    );
    expect(r).toEqual({ ok: false, reason: 'no perk backed by the page' });
  });

  it('refuses paid programs, missing programs and names the page doesn’t use', () => {
    expect(checkPerkPage({ program: null }, { page: PAGE, domain: 'x.com' })).toEqual({ ok: false, reason: 'no free program' });
    expect(checkPerkPage(program({ free_to_join: false }), { page: PAGE, domain: 'x.com' })).toEqual({ ok: false, reason: 'not free to join' });
    expect(checkPerkPage(program({ join_evidence: 'Terms apply. Earn 10 points' }), { page: PAGE, domain: 'x.com' })).toEqual({ ok: false, reason: 'not free to join' });
    expect(checkPerkPage(program({ name: 'Sweetgreen Plus' }), { page: PAGE, domain: 'x.com' })).toEqual({ ok: false, reason: 'name not on page' });
  });

  it('falls back to a plain way to join when the model adds a number', () => {
    const r = checkPerkPage(program({ how_to_join: 'Join in 2 minutes in the app.' }), { page: PAGE, domain: 'sweetgreen.com' });
    expect(r.ok && r.value.how_to).toBe('Join free on sweetgreen.com.');
  });
});

describe('bestPerkUrl', () => {
  it('prefers a short, clearly named rewards page on the store’s own site', () => {
    const urls = [
      'https://www.store.example/blog/rewards-tips',
      'https://www.store.example/credit-card/rewards',
      'https://www.store.example/en/help/rewards/faq',
      'https://www.store.example/rewards',
      'https://other.example/rewards',
    ];
    expect(bestPerkUrl(urls, 'https://www.store.example')).toBe('https://www.store.example/rewards');
    expect(bestPerkUrl(['https://www.store.example/about'], 'https://www.store.example')).toBeNull();
  });
});
