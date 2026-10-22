import type { StudentOffer } from './types';

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
