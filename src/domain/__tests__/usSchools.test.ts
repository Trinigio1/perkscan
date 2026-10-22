import { hipoToUniversities, hostOf, scorecardToUniversities } from '../usSchools';

const hipo = (name: string, domains: string[], code = 'US') => ({ name, alpha_two_code: code, 'state-province': null, domains, web_pages: [`http://www.${domains[0]}/`] });

describe('US school import', () => {
  it('keeps US schools with their email domains and stable ids', () => {
    const out = hipoToUniversities(
      [hipo('University of Florida', ['ufl.edu']), hipo('University of the West Indies', ['uwi.edu'], 'TT'), hipo('Marywood University', ['marywood.edu'])],
      'https://example.com/list', '2026-10-22',
    );
    expect(out.map((u) => [u.id, u.name, u.email_domains[0]])).toEqual([
      ['us_marywood_edu', 'Marywood University', 'marywood.edu'],
      ['us_ufl_edu', 'University of Florida', 'ufl.edu'],
    ]);
    expect(out[0]).toMatchObject({ country: 'US', source_url: 'https://example.com/list', last_verified: '2026-10-22' });
  });

  it('drops exact duplicates and keeps ids unique when schools share a domain', () => {
    const out = hipoToUniversities(
      [hipo('A College', ['shared.edu']), hipo('A College', ['shared.edu']), hipo('B College', ['shared.edu'])],
      'https://example.com', '2026-10-22',
    );
    expect(out.map((u) => u.id)).toEqual(['us_shared_edu', 'us_shared_edu_2']);
  });

  it('reads College Scorecard records, using the website for the domain', () => {
    const out = scorecardToUniversities(
      [{ id: 1, 'school.name': 'University of Florida', 'school.state': 'FL', 'school.school_url': 'www.ufl.edu/' }],
      'https://collegescorecard.ed.gov/data/', '2026-10-22',
    );
    expect(out[0]).toMatchObject({ id: 'us_ufl_edu', state: 'FL', email_domains: ['ufl.edu'], website: 'https://ufl.edu' });
  });

  it('extracts hosts safely', () => {
    expect(hostOf('https://WWW.Example.EDU/path?x=1')).toBe('example.edu');
    expect(hostOf('not a url')).toBeNull();
    expect(hostOf(null)).toBeNull();
  });
});
