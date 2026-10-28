import { domainsWithParents, suggestions, usesProgram, type SuggestionInput } from '../suggestions';
import type { Program } from '../programs';
import type { StudentOffer, University } from '../types';
import { opp } from '../__fixtures__/opportunities';

const program = (p: Partial<Program> & { id: string }): Program => ({
  kind: 'loyalty', name: p.id, provider: p.id, countries: [], summary: 'Expires after 24 months.', how_to: 'h', url: 'https://x.example', merchants: [],
  window_days: null, interests: [], issuers: [], student_only: false, status: 'active', last_verified: '2026-10-22', sort_order: 0, ...p,
});
const uwi: University = { id: 'uwi_sta', name: 'The University of the West Indies, St. Augustine', short_name: 'UWI St. Augustine', country: 'TT', state: null, email_domains: ['my.uwi.edu'], website: null };
const offer = (o: Partial<StudentOffer> & { id: string }) => ({ name: o.id, provider: 'P', category: 'software', summary: 's', eligibility: 'e', how_to_verify: 'h', url: 'https://x.example', countries: [], university_ids: [], status: 'active', last_verified: null, ...o }) as StudentOffer;

const base: SuggestionInput = {
  country: 'TT', isStudent: false, school: null, schoolHints: [], studentOffers: [], studentClaims: [], programs: [], opportunities: [],
  receipts: [], senderDomains: [], userCards: [], cards: [], benefits: [],
};
const ids = (d: Partial<SuggestionInput>) => suggestions({ ...base, ...d }).map((s) => s.id);

describe('suggestions', () => {
  it('asks about school when a school emails you and you haven’t said you’re a student', () => {
    expect(ids({ schoolHints: [uwi] })).toEqual(['school:uwi_sta']);
    expect(ids({ schoolHints: [uwi], isStudent: true })).not.toContain('school:uwi_sta');
  });

  it('counts unclaimed student perks for your country and school', () => {
    const offers = [offer({ id: 'github' }), offer({ id: 'us_only', countries: ['US'] }), offer({ id: 'uwi_only', university_ids: ['uwi_sta'] }), offer({ id: 'claimed' })];
    const s = suggestions({ ...base, isStudent: true, school: uwi, studentOffers: offers, studentClaims: ['claimed'] });
    expect(s[0]!.title).toBe('2 student perks to claim');
  });

  it('spots loyalty programs from who emails you or where you shop, unless you already track them', () => {
    const marriott = program({ id: 'marriott_bonvoy', name: 'Marriott Bonvoy', provider: 'Marriott', merchants: ['marriott'] });
    const massy = program({ id: 'massy_card', name: 'Massy Card', provider: 'Massy', merchants: ['massy'], countries: ['TT'], status: 'TODO_VERIFY' });
    const caribbean = program({ id: 'caribbean_miles', name: 'Caribbean Miles', merchants: ['caribbean airlines'] });
    const programs = [marriott, massy, caribbean];
    expect(ids({ programs, senderDomains: ['email.marriott.com', 'caribbean-airlines.com'] })).toEqual(['loyalty:marriott_bonvoy', 'loyalty:caribbean_miles']);
    expect(ids({ programs, receipts: [{ merchant: 'Massy Stores Trincity' }] })).toEqual(['loyalty:massy_card']);
    expect(ids({ programs, senderDomains: ['marriott.com'], opportunities: [opp({ type: 'points', title: '12,000 Marriott Bonvoy' })] })).toEqual([]);
    // Unconfirmed programs don't claim an expiry rule.
    expect(suggestions({ ...base, programs, receipts: [{ merchant: 'Massy' }] })[0]!.body).toMatch(/^You deal with Massy/);
  });

  it('only suggests programs for where you live', () => {
    const starbucks = program({ id: 'starbucks', merchants: ['starbucks'], countries: ['US'] });
    expect(ids({ programs: [starbucks], senderDomains: ['starbucks.com'] })).toEqual([]);
    expect(ids({ programs: [starbucks], senderDomains: ['starbucks.com'], country: 'US' })).toEqual(['loyalty:starbucks']);
  });

  it('points out lounge access on a card you have', () => {
    const s = suggestions({
      ...base,
      userCards: [{ id: 'uc1', card_id: 'aero' }],
      cards: [{ id: 'aero', product_name: 'Scotiabank Aero Platinum Visa' }],
      benefits: [{ id: 'aero__lounges', card_id: 'aero' }],
    });
    expect(s.map((x) => x.title)).toEqual(['Airport lounges with your Scotiabank Aero Platinum Visa']);
  });

  it('adds checks for where you live: unclaimed money, deadlines, library', () => {
    const programs = [
      program({ id: 'missing_money', kind: 'unclaimed', name: 'Unclaimed money (US states)', countries: ['US'] }),
      program({ id: 'tt_bonds', kind: 'unclaimed', name: 'Unclaimed government bond payments', provider: 'Central Bank', countries: ['TT'] }),
      program({ id: 'fsa', kind: 'deadline_rule', name: 'Health FSA: use it or lose it', countries: ['US'] }),
      program({ id: 'nalis', kind: 'library', name: 'NALIS library card', countries: ['TT'] }),
      program({ id: 'libby', kind: 'library', name: 'Libby' }),
    ];
    expect(ids({ programs })).toEqual(['unclaimed:tt_bonds', 'library:nalis']);
    const us = suggestions({ ...base, programs, country: 'US' });
    expect(us.map((s) => s.id)).toEqual(['unclaimed:missing_money', 'deadline:fsa']);
    expect(us[1]!.title).toBe('Health FSA? Add your balance');
    expect(suggestions({ ...base, programs })[1]!.title).toBe('Free with a NALIS card');
  });
});

describe('helpers', () => {
  it('adds parent domains', () => {
    expect(domainsWithParents(['sta.uwi.edu', 'email.marriott.com']).sort()).toEqual(['email.marriott.com', 'marriott.com', 'sta.uwi.edu', 'uwi.edu']);
  });

  it('needs a real name match, not a fragment', () => {
    expect(usesProgram({ merchants: ['target'] }, ['targetedmail.example'], [])).toBe(false);
    expect(usesProgram({ merchants: ['target'] }, ['em.target.com'], [])).toBe(true);
    expect(usesProgram({ merchants: ['massy'] }, [], ['Massymo Pizza'])).toBe(false);
    expect(usesProgram({ merchants: ['aa'] }, ['aa.com'], [])).toBe(false); // too short to trust
  });
});
