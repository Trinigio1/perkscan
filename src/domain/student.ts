import type { StudentOffer, University } from './types';

export interface StudentGroups {
  /** Offers only for students of your school. */
  school: StudentOffer[];
  /** Offers any student in your country can get (worldwide ones included). */
  everywhere: StudentOffer[];
  /** Offers only for students at schools in other countries (shown so you know why you can't get them). */
  elsewhere: StudentOffer[];
}

/** Sorts student offers by whether *this* student can get them. Other schools' offers are left out. */
export function groupStudentOffers(offers: StudentOffer[], who: { country: string | null; universityId: string | null }): StudentGroups {
  const inCountry = (o: StudentOffer) => o.countries.length === 0 || (!!who.country && o.countries.includes(who.country));
  const g: StudentGroups = { school: [], everywhere: [], elsewhere: [] };
  for (const o of offers) {
    const forSchools = o.university_ids ?? [];
    if (forSchools.length) {
      if (who.universityId && forSchools.includes(who.universityId)) g.school.push(o);
    } else if (inCountry(o)) g.everywhere.push(o);
    else g.elsewhere.push(o);
  }
  return g;
}

/**
 * The one line that says how *you* get an offer at your school, e.g. "Use your @ufl.edu email".
 * Only from what the offer says it needs; null when there's nothing specific to add.
 */
export function personalHow(o: StudentOffer, school: University | null): string | null {
  if (!school) return null;
  const how = `${o.how_to_verify} ${o.eligibility}`;
  const domain = school.email_domains[0];
  if (/school(-issued)? email|\.edu|academic email/i.test(how) && domain) return `Use your @${domain} email`;
  if (/sheerid/i.test(how)) return `Pick ${school.name} on the SheerID form`;
  if (/unidays/i.test(how)) return `Verify as a ${school.short_name} student with UNiDAYS`;
  if (/student id/i.test(how)) return `Have your ${school.short_name} student ID ready`;
  return null;
}
