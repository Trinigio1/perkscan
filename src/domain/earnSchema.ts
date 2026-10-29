import { z } from 'zod';
import { sqlLiteral } from './seedSchema';

// Earn rates per card (seed/earn_rates.json): what each card earns where, from the issuer's own page.
// A points or miles card only gets a cash value when the issuer states one; otherwise its rate is shown
// but never turned into dollars. Pure, so the rules are tested.

export const EARN_CATEGORIES = [
  'everything', 'dining', 'groceries', 'online_groceries', 'gas', 'transit', 'streaming', 'drugstores', 'travel', 'flights', 'hotels',
  'online_retail', 'entertainment',
  // Only at the merchants listed: a store, or the issuer's own travel site.
  'merchant', 'portal', 'portal_hotels',
  // Depend on something PerkScan can't see: a category you picked, this quarter's rotating ones, your top one.
  'choice', 'rotating', 'top_category',
] as const;
export type EarnCategory = (typeof EARN_CATEGORIES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const earnRateSchema = z
  .object({
    category: z.enum(EARN_CATEGORIES),
    /** Percent back for cash cards; points or miles per $1 otherwise. */
    rate: z.number().positive().max(20),
    merchants: z.array(z.string().min(2)).optional(),
    cap: z.number().positive().optional(),
    cap_period: z.enum(['month', 'quarter', 'year', 'billing_cycle']).optional(),
    /** Something needed at checkout ("Apple Pay") or a condition PerkScan can't check. */
    needs: z.string().min(3).optional(),
    note: z.string().min(3).optional(),
    source_url: z.string().url(),
  })
  .superRefine((r, ctx) => {
    const atMerchants = r.category === 'merchant' || r.category === 'portal' || r.category === 'portal_hotels';
    if (atMerchants && !r.merchants?.length) ctx.addIssue({ code: 'custom', path: ['merchants'], message: `${r.category} rates need merchants` });
    if (!atMerchants && r.merchants) ctx.addIssue({ code: 'custom', path: ['merchants'], message: 'merchants only go with merchant or portal rates' });
    if (!!r.cap !== !!r.cap_period) ctx.addIssue({ code: 'custom', path: ['cap'], message: 'cap and cap_period go together' });
    if ((r.category === 'choice' || r.category === 'rotating' || r.category === 'top_category') && !r.needs) {
      ctx.addIssue({ code: 'custom', path: ['needs'], message: `${r.category} rates must say what they depend on` });
    }
  });

export const earnCardSchema = z
  .object({
    card_id: z.string().regex(/^[a-z0-9_]+$/),
    reward: z.object({
      kind: z.enum(['cash', 'points', 'miles']),
      cents_per_unit: z.number().positive().max(5).nullable(),
      value_basis: z.string().min(5).nullable(),
      value_source_url: z.string().url().nullable(),
    }),
    rates: z.array(earnRateSchema).min(1),
    note: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.reward.kind === 'cash' && c.reward.cents_per_unit !== null) ctx.addIssue({ code: 'custom', path: ['reward'], message: 'Cash cards are in percent; no cents_per_unit' });
    if (c.reward.kind !== 'cash' && c.reward.cents_per_unit !== null && (!c.reward.value_basis || !c.reward.value_source_url)) {
      ctx.addIssue({ code: 'custom', path: ['reward'], message: 'A points value needs the issuer’s own basis and source' });
    }
  });

export const earnFileSchema = z.object({
  _readme: z.string().optional(),
  last_verified: isoDate,
  cards: z.array(earnCardSchema),
});
export type EarnFile = z.infer<typeof earnFileSchema>;

const arr = (a: string[] | undefined) => (a?.length ? `array[${a.map(sqlLiteral).join(', ')}]::text[]` : `'{}'::text[]`);

/** Replaces each listed card's rates, so a rate removed from the file goes away too. */
export function earnToSql(f: EarnFile, knownCards: Set<string>): string[] {
  const out: string[] = [];
  for (const c of f.cards) {
    if (!knownCards.has(c.card_id)) throw new Error(`seed/earn_rates.json: unknown card ${c.card_id}`);
    const r = c.reward;
    out.push(
      `insert into public.card_rewards (card_id, kind, cents_per_unit, value_basis, value_source_url, note, last_verified) values (${[c.card_id, r.kind, r.cents_per_unit, r.value_basis, r.value_source_url, c.note ?? null, f.last_verified].map(sqlLiteral).join(', ')}) ` +
        `on conflict (card_id) do update set kind = excluded.kind, cents_per_unit = excluded.cents_per_unit, value_basis = excluded.value_basis, value_source_url = excluded.value_source_url, note = excluded.note, last_verified = excluded.last_verified;`,
    );
    out.push(`delete from public.card_earn_rates where card_id = ${sqlLiteral(c.card_id)};`);
    c.rates.forEach((x, i) => {
      out.push(
        `insert into public.card_earn_rates (card_id, category, rate, merchants, cap, cap_period, needs, note, source_url, last_verified, sort_order) values (` +
          `${[c.card_id, x.category, x.rate].map(sqlLiteral).join(', ')}, ${arr(x.merchants)}, ${[x.cap ?? null, x.cap_period ?? null, x.needs ?? null, x.note ?? null, x.source_url, f.last_verified, i].map(sqlLiteral).join(', ')});`,
      );
    });
  }
  return out;
}
