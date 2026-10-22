import { z } from 'zod';
import { sqlLiteral } from './seedSchema';

// Curated lists besides the card catalog: student offers and class-action settlements.
// Same rule as cards: nothing goes in without an official source and a check date.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const slug = z.string().regex(/^[a-z0-9_]+$/, 'Use lowercase letters, digits and underscores');
const https = z.string().url().refine((u) => u.startsWith('https://'), 'Use an https:// link');
const country = z.string().regex(/^[A-Z]{2}$/, 'Use a 2-letter country code');

export const studentOfferSchema = z
  .object({
    id: slug,
    name: z.string().min(1),
    provider: z.string().min(1),
    category: z.enum(['software', 'design', 'productivity', 'developer', 'music', 'shopping', 'travel', 'other']),
    /** What students get. Words only — no prices, which change and vary by country. */
    summary: z.string().min(1),
    eligibility: z.string().min(1),
    how_to_verify: z.string().min(1),
    url: https,
    /** Countries where it's available; empty = available worldwide (per the provider). */
    countries: z.array(country),
    /** Only students of these schools (ids from seed/universities.json); empty = any school. */
    university_ids: z.array(slug).default([]),
    status: z.enum(['active', 'TODO_VERIFY']),
    source_url: https.nullable(),
    last_verified: isoDate.nullable(),
  })
  .superRefine((o, ctx) => {
    if (o.status === 'active' && (!o.source_url || !o.last_verified)) {
      ctx.addIssue({ code: 'custom', path: ['status'], message: 'An active offer needs source_url and last_verified' });
    }
  });

export const universitySchema = z.object({
  id: slug,
  name: z.string().min(1),
  short_name: z.string().min(1),
  country,
  state: z.string().min(1).nullable().default(null),
  /** School email domains, e.g. ["ufl.edu"]. Most student offers verify with these. */
  email_domains: z.array(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'A lowercase domain like ufl.edu')).default([]),
  website: z.string().url().nullable().default(null),
  /** The list it comes from: an accreditation body, the US College Scorecard, or a community list (named in _readme). */
  source_url: https,
  last_verified: isoDate,
});

export const universityFileSchema = z.object({
  _readme: z.array(z.string()).optional(),
  universities: z.array(universitySchema),
});

export type UniversityFile = z.infer<typeof universityFileSchema>;

/** Offers can only point at schools that exist. */
export function unknownUniversityIds(students: StudentFile, universities: UniversityFile): string[] {
  const ids = new Set(universities.universities.map((u) => u.id));
  return students.offers.flatMap((o) => o.university_ids.filter((u) => !ids.has(u)).map((u) => `${o.id} → ${u}`));
}

export function universitiesToSql(f: UniversityFile): string[] {
  return f.universities.map((u, i) => upsert('universities', { ...u, sort_order: i }, ['email_domains']));
}

export const studentFileSchema = z.object({
  _readme: z.array(z.string()).optional(),
  offers: z.array(studentOfferSchema),
});

export const settlementSchema = z
  .object({
    id: slug,
    name: z.string().min(1),
    description: z.string().min(1),
    /** Lowercase store names; a receipt matches when its merchant contains one. */
    eligible_merchants: z.array(z.string().min(2).regex(/^[a-z0-9 .&'-]+$/, 'Lowercase store names')).min(1),
    eligible_products: z.string().min(1),
    purchase_start: isoDate,
    purchase_end: isoDate,
    claim_deadline: isoDate,
    /** The official claim site only. */
    claim_url: https,
    proof_required: z.string().min(1),
    /** Where class members must live; empty = not limited by country. */
    eligible_countries: z.array(country),
    /** e.g. "Up to US$20 per person, depending on claims" — as the official site states it. */
    payout_note: z.string().nullable(),
    status: z.enum(['active', 'closed']),
    source_url: https,
    last_verified: isoDate,
  })
  .superRefine((s, ctx) => {
    if (s.purchase_end < s.purchase_start) ctx.addIssue({ code: 'custom', path: ['purchase_end'], message: 'Ends before it starts' });
  });

export const settlementFileSchema = z.object({
  _readme: z.array(z.string()).optional(),
  settlements: z.array(settlementSchema),
});

export type StudentFile = z.infer<typeof studentFileSchema>;
export type SettlementFile = z.infer<typeof settlementFileSchema>;

const textArray = (a: string[]) => `array[${a.map(sqlLiteral).join(', ')}]::text[]`;

function upsert(table: string, row: Record<string, unknown>, arrays: string[] = []): string {
  const cols = Object.keys(row);
  const vals = cols.map((k) => (arrays.includes(k) ? textArray(row[k] as string[]) : sqlLiteral(row[k])));
  return (
    `insert into public.${table} (${cols.join(', ')}) values (${vals.join(', ')}) ` +
    `on conflict (id) do update set ${cols.filter((k) => k !== 'id').map((k) => `${k} = excluded.${k}`).join(', ')};`
  );
}

export function studentToSql(f: StudentFile): string[] {
  return f.offers.map((o, i) => upsert('student_offers', { ...o, sort_order: i }, ['countries', 'university_ids']));
}

export function settlementsToSql(f: SettlementFile): string[] {
  return f.settlements.map((s) => upsert('settlements', s, ['eligible_merchants', 'eligible_countries']));
}

export const PROGRAM_KINDS = ['loyalty', 'price_adjust', 'unclaimed', 'library', 'refund_rule', 'deadline_rule'] as const;

export const programSchema = z
  .object({
    id: slug,
    kind: z.enum(PROGRAM_KINDS),
    name: z.string().min(1),
    provider: z.string().min(1),
    /** Where it applies; empty = anywhere. */
    countries: z.array(country),
    summary: z.string().min(1).max(300),
    how_to: z.string().min(1).max(300),
    url: https,
    /** Lowercase store names a receipt's merchant must contain. */
    merchants: z.array(z.string().min(2).regex(/^[a-z0-9 .&'-]+$/, 'Lowercase store names')),
    /** Days after purchase a price adjustment is allowed; null = during the return period. */
    window_days: z.number().int().min(1).max(365).nullable(),
    status: z.enum(['active', 'TODO_VERIFY']),
    source_url: https.nullable(),
    last_verified: isoDate.nullable(),
  })
  .superRefine((p, ctx) => {
    if (p.status === 'active' && (!p.source_url || !p.last_verified)) {
      ctx.addIssue({ code: 'custom', path: ['status'], message: 'An active program needs source_url and last_verified' });
    }
    if (p.kind === 'price_adjust' && !p.merchants.length) {
      ctx.addIssue({ code: 'custom', path: ['merchants'], message: 'A price adjustment policy needs the store names it applies to' });
    }
    if (p.kind !== 'price_adjust' && p.window_days !== null) {
      ctx.addIssue({ code: 'custom', path: ['window_days'], message: 'window_days is only for price adjustment policies' });
    }
  });

export const programFileSchema = z.object({
  _readme: z.array(z.string()).optional(),
  programs: z.array(programSchema),
});

export type ProgramFile = z.infer<typeof programFileSchema>;

export function programsToSql(f: ProgramFile): string[] {
  return f.programs.map((p, i) => upsert('perk_programs', { ...p, sort_order: i }, ['countries', 'merchants']));
}
