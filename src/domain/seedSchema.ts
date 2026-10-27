import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const money = z.number().nonnegative().nullable();
const slug = z.string().regex(/^[a-z0-9_]+$/, 'Use lowercase letters, digits and underscores');

export const benefitSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+__[a-z0-9_]+$/, 'Benefit ids look like <card_id>__<benefit>'),
    type: z.enum(['credit', 'protection', 'perk']),
    name: z.string().min(1),
    amount: money,
    period: z.enum(['monthly', 'quarterly', 'semiannual', 'annual', 'per_claim']),
    period_anchor: z.enum(['calendar', 'cardmember_year']),
    amount_schedule: z.record(z.string().regex(/^(1[0-2]|[1-9])$/, 'Month keys are "1"–"12"'), z.number().nonnegative()).nullable(),
    terms_summary: z.string().nullable(),
    max_coverage: money,
    coverage_window_days: z.number().int().positive().nullable(),
    enrollment_required: z.boolean(),
    merchant_match: z.object({ merchants: z.array(z.string().min(1)) }).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. USD').nullable().default(null),
    status: z.enum(['active', 'TODO_VERIFY']),
    source_url: z.string().url().nullable(),
    last_verified: isoDate.nullable(),
    notes: z.string().nullable(),
    /**
     * What a perk with no stated amount is worth: the price the provider itself puts on it ("a $120 value
     * per year"), or what the same thing costs to buy. Only with the provider's own source.
     */
    worth: money.optional().default(null),
    worth_period: z.enum(['year', 'use']).nullable().optional().default(null),
    worth_basis: z.string().min(1).nullable().optional().default(null),
    worth_source_url: z.string().url().nullable().optional().default(null),
  })
  .superRefine((b, ctx) => {
    if (b.worth !== null && (b.status !== 'active' || !b.worth_period || !b.worth_basis || !b.worth_source_url)) {
      ctx.addIssue({ code: 'custom', path: ['worth'], message: 'A worth needs a verified benefit, worth_period, worth_basis and worth_source_url' });
    }
    if (b.amount_schedule && b.period !== 'monthly') {
      ctx.addIssue({ code: 'custom', path: ['amount_schedule'], message: 'amount_schedule is only for monthly benefits' });
    }
    if (b.type !== 'protection' && (b.max_coverage !== null || b.coverage_window_days !== null)) {
      ctx.addIssue({ code: 'custom', path: ['max_coverage'], message: 'Coverage fields are only for protections' });
    }
    if (b.status === 'TODO_VERIFY' && (b.amount !== null || b.max_coverage !== null || b.amount_schedule !== null)) {
      ctx.addIssue({ code: 'custom', path: ['status'], message: 'Amounts can only be set on verified benefits — set status "active", source_url and last_verified' });
    }
    if (b.status === 'active') {
      if (!b.source_url) ctx.addIssue({ code: 'custom', path: ['source_url'], message: 'Verified benefits need a source_url' });
      if (!b.last_verified) ctx.addIssue({ code: 'custom', path: ['last_verified'], message: 'Verified benefits need last_verified' });
      if (b.type === 'credit' && b.period !== 'per_claim' && b.amount === null) {
        ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Verified credits need an amount' });
      }
    }
  });

export const cardSchema = z
  .object({
    id: slug,
    /** A payment card, or a membership (Prime, Costco, a phone plan…) that comes with perks. */
    kind: z.enum(['card', 'membership']).default('card'),
    issuer: z.string().min(1),
    product_name: z.string().min(1),
    country: z.string().regex(/^[A-Z]{2}$/, 'Use a 2-letter country code, e.g. US or TT').default('US'),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. USD or TTD').default('USD'),
    annual_fee: money,
    fee_note: z.string().nullable().optional(),
    status: z.enum(['active', 'TODO_VERIFY']),
    source_url: z.string().url().nullable(),
    last_verified: isoDate.nullable(),
    benefits: z.array(benefitSchema),
  })
  .superRefine((c, ctx) => {
    if (c.status === 'TODO_VERIFY' && c.annual_fee !== null) {
      ctx.addIssue({ code: 'custom', path: ['annual_fee'], message: 'Set status "active" and last_verified when you verify the annual fee' });
    }
    // A membership that's part of something else (a phone plan) may have no fee of its own.
    if (c.status === 'active' && ((c.annual_fee === null && c.kind !== 'membership') || !c.last_verified || !c.source_url)) {
      ctx.addIssue({ code: 'custom', path: ['status'], message: 'A verified card needs annual_fee, source_url and last_verified' });
    }
    c.benefits.forEach((b, i) => {
      if (!b.id.startsWith(`${c.id}__`)) {
        ctx.addIssue({ code: 'custom', path: ['benefits', i, 'id'], message: `Benefit id must start with "${c.id}__"` });
      }
    });
  });

export const seedFileSchema = z
  .object({
    _readme: z.array(z.string()).optional(),
    cards: z.array(cardSchema).min(1),
  })
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    for (const id of [...f.cards.map((c) => c.id), ...f.cards.flatMap((c) => c.benefits.map((b) => b.id))]) {
      if (seen.has(id)) ctx.addIssue({ code: 'custom', path: ['cards'], message: `Duplicate id: ${id}` });
      seen.add(id);
    }
  });

export type SeedFile = z.infer<typeof seedFileSchema>;
export type SeedCard = z.infer<typeof cardSchema>;
export type SeedBenefit = z.infer<typeof benefitSchema>;

export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `${sqlLiteral(JSON.stringify(v))}::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Turns a validated seed file into idempotent upserts. Benefits removed from the file are not deleted. */
export function seedToSql(seed: SeedFile): string {
  const lines: string[] = [
    '-- GENERATED by scripts/build-seed.ts from seed/card_benefits.json. Do not edit by hand.',
    'begin;',
  ];
  seed.cards.forEach((c, ci) => {
    lines.push(
      `insert into public.cards (id, kind, issuer, product_name, country, currency, annual_fee, status, source_url, last_verified, sort_order) values (` +
        [c.id, c.kind, c.issuer, c.product_name, c.country, c.currency, c.annual_fee, c.status, c.source_url, c.last_verified, ci].map(sqlLiteral).join(', ') +
        `) on conflict (id) do update set kind = excluded.kind, issuer = excluded.issuer, product_name = excluded.product_name, country = excluded.country, ` +
        `currency = excluded.currency, annual_fee = excluded.annual_fee, ` +
        `status = excluded.status, source_url = excluded.source_url, last_verified = excluded.last_verified, sort_order = excluded.sort_order;`,
    );
    c.benefits.forEach((b, bi) => {
      const cols = [
        'id', 'card_id', 'type', 'name', 'amount', 'period', 'period_anchor', 'amount_schedule', 'terms_summary', 'max_coverage',
        'coverage_window_days', 'enrollment_required', 'merchant_match', 'currency', 'status', 'source_url', 'last_verified', 'notes', 'sort_order',
        'worth', 'worth_period', 'worth_basis', 'worth_source_url',
      ];
      const vals = [
        b.id, c.id, b.type, b.name, b.amount, b.period, b.period_anchor, b.amount_schedule, b.terms_summary, b.max_coverage,
        b.coverage_window_days, b.enrollment_required, b.merchant_match, b.currency, b.status, b.source_url, b.last_verified, b.notes, bi,
        b.worth, b.worth_period, b.worth_basis, b.worth_source_url,
      ];
      lines.push(
        `insert into public.card_benefits (${cols.join(', ')}) values (${vals.map(sqlLiteral).join(', ')}) ` +
          `on conflict (id) do update set ${cols.slice(1).map((k) => `${k} = excluded.${k}`).join(', ')};`,
      );
    });
  });
  lines.push('commit;', '');
  return lines.join('\n');
}
