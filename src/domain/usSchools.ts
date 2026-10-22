// Turns public US college lists into PerkScan's school records. Pure, for testing;
// scripts/import-us-schools.ts does the downloading.

export interface SchoolRecord {
  id: string;
  name: string;
  short_name: string;
  country: string;
  state: string | null;
  /** School email domains, e.g. ["ufl.edu"]; most student offers verify with these. */
  email_domains: string[];
  website: string | null;
  source_url: string;
  last_verified: string;
}

export interface HipoUniversity {
  name: string;
  alpha_two_code: string;
  'state-province': string | null;
  domains: string[];
  web_pages: string[];
}

export interface ScorecardSchool {
  id: number;
  'school.name': string;
  'school.state': string | null;
  'school.school_url': string | null;
}

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** "www.UFL.edu/" or "https://www.ufl.edu/admissions" -> "ufl.edu" */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const host = url.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#:]/)[0]!.replace(/^www\d?\./, '');
  return DOMAIN.test(host) ? host : null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

/** Ids from the main domain ("ufl.edu" -> "us_ufl_edu"), made unique if two schools share one. */
function withIds(rows: Omit<SchoolRecord, 'id'>[], key: (r: Omit<SchoolRecord, 'id'>) => string): SchoolRecord[] {
  const seen = new Map<string, number>();
  return rows
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => {
      const base = `us_${slug(key(r))}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { id: n === 1 ? base : `${base}_${n}`, ...r };
    });
}

export function hipoToUniversities(raw: HipoUniversity[], sourceUrl: string, today: string): SchoolRecord[] {
  const rows = raw
    .filter((u) => u.alpha_two_code === 'US' && u.name?.trim())
    .map((u) => {
      const domains = [...new Set(u.domains.map((d) => d.trim().toLowerCase()).filter((d) => DOMAIN.test(d)))];
      return {
        name: u.name.trim(),
        short_name: u.name.trim(),
        country: 'US',
        state: u['state-province']?.trim() || null,
        email_domains: domains,
        website: u.web_pages[0]?.trim() || null,
        source_url: sourceUrl,
        last_verified: today,
      };
    })
    // The same school listed twice (same name and domain) is kept once.
    .filter((r, i, all) => all.findIndex((x) => x.name === r.name && x.email_domains[0] === r.email_domains[0]) === i);
  return withIds(rows, (r) => r.email_domains[0] ?? r.name);
}

export function scorecardToUniversities(raw: ScorecardSchool[], sourceUrl: string, today: string): SchoolRecord[] {
  const rows = raw
    .filter((s) => s['school.name']?.trim())
    .map((s) => {
      const host = hostOf(s['school.school_url']);
      return {
        name: s['school.name'].trim(),
        short_name: s['school.name'].trim(),
        country: 'US',
        state: s['school.state'] ?? null,
        // The website's domain is usually, not always, the email domain.
        email_domains: host ? [host] : [],
        website: host ? `https://${host}` : null,
        source_url: sourceUrl,
        last_verified: today,
      };
    });
  return withIds(rows, (r) => r.email_domains[0] ?? r.name);
}
