import { groupStudentOffers, personalHow } from '../student';
import type { StudentOffer, University } from '../types';

const offer = (id: string, countries: string[] = [], university_ids: string[] = []): StudentOffer => ({
  id, name: id, provider: 'P', category: 'software', summary: '', eligibility: '', how_to_verify: '', url: 'https://x.example.com',
  countries, university_ids, status: 'active', source_url: null, last_verified: null,
});
const offers = [offer('github'), offer('prime', ['GB', 'US']), offer('uwi_o365', [], ['uwi_st_augustine']), offer('utt_only', [], ['utt'])];

describe('groupStudentOffers', () => {
  it('shows your school’s perks, worldwide ones, and what you can’t get here', () => {
    const g = groupStudentOffers(offers, { country: 'TT', universityId: 'uwi_st_augustine' });
    expect(g.school.map((o) => o.id)).toEqual(['uwi_o365']);
    expect(g.everywhere.map((o) => o.id)).toEqual(['github']);
    expect(g.elsewhere.map((o) => o.id)).toEqual(['prime']);
  });
  it('hides school perks until a school is picked, and other schools’ perks always', () => {
    const g = groupStudentOffers(offers, { country: 'US', universityId: null });
    expect(g.school).toEqual([]);
    expect(g.everywhere.map((o) => o.id)).toEqual(['github', 'prime']);
  });
});

describe('personalHow', () => {
  const uf: University = { id: 'us_ufl_edu', name: 'University of Florida', short_name: 'University of Florida', country: 'US', state: null, email_domains: ['ufl.edu'], website: null };
  const withHow = (how_to_verify: string) => ({ ...offer('x'), how_to_verify });
  it('names your school email when an offer verifies with one', () => {
    expect(personalHow(withHow('Sign up with your school email address.'), uf)).toBe('Use your @ufl.edu email');
  });
  it('tells you what to pick on SheerID or UNiDAYS, or to have your ID ready', () => {
    expect(personalHow(withHow('Verified by SheerID.'), uf)).toBe('Pick University of Florida on the SheerID form');
    expect(personalHow(withHow('Checked by UNiDAYS.'), { ...uf, email_domains: [] })).toBe('Verify as a University of Florida student with UNiDAYS');
    expect(personalHow(withHow('Show your student ID.'), uf)).toBe('Have your University of Florida student ID ready');
  });
  it('adds nothing without a school or a specific step', () => {
    expect(personalHow(withHow('Sign up online.'), uf)).toBeNull();
    expect(personalHow(withHow('Use your school email.'), null)).toBeNull();
  });
});
