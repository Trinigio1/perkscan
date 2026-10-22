import { groupStudentOffers } from '../student';
import type { StudentOffer } from '../types';

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
