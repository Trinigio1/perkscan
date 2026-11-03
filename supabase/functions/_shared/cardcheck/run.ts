import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModelCall } from '../inbox/parse.ts';
import { costUsd } from '../inbox/parse.ts';
import { readPage, sameSite, type Fetch } from '../scout/page.ts';
import { scoutSpendUsd } from '../scout/run.ts';
import { checkCardPage, checkPricePage, type Change, type KnownBenefit } from './check.ts';
import { CardPageSchema, cardMessage, PricePageSchema, priceMessage, type CardPage, type PricePage } from './extract.ts';

// The monthly card check: every card's official page and every price behind a perk value is re-read
// about once a month, a few per hourly scout run. What still matches gets a fresh "last checked" date;
// what changed is recorded (check.ts decides what applies on its own and what waits in catalog_changes).

export interface CardCheckReport {
  kind: 'card' | 'price';
  id: string;
  result: string;
}

export interface CardCheckOptions {
  model: string;
  monthlyBudgetUsd: number;
  fetch?: Fetch;
  now?: Date;
  /** Cards and prices per run; with the hourly schedule that's every card within a day or two a month. */
  cardsPerRun?: number;
  pricesPerRun?: number;
  /** Only these cards and prices, due or not (manual runs and tests). */
  cardIds?: string[];
  priceIds?: string[];
}

const RECHECK_DAYS = 30;
/** Pages read per card: its own page and up to two more its perks were verified on (same site). */
const PAGES_PER_CARD = 3;

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, text: string | null): T | null {
  if (!text) return null;
  try {
    const r = schema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

async function ask(db: SupabaseClient, call: ModelCall, model: string, input: string) {
  const res = await call(input);
  await db.from('ai_usage').insert({ user_id: null, model, input_tokens: res.inputTokens, output_tokens: res.outputTokens, cost_usd: costUsd(res) });
  return res.stopReason === 'refusal' ? null : res.text;
}

/** Records a change for review (or as already applied). The same open change is never added twice. */
async function record(db: SupabaseClient, row: Record<string, unknown>) {
  const { error } = await db.from('catalog_changes').insert(row);
  if (error && error.code !== '23505') console.warn('catalog_changes', error.message);
}

export async function runCardCheck(db: SupabaseClient, models: { card: ModelCall; price: ModelCall }, opts: CardCheckOptions): Promise<CardCheckReport[]> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const cutoff = new Date(now.getTime() - RECHECK_DAYS * 86_400_000).toISOString();
  const reports: CardCheckReport[] = [];
  const overBudget = async () => (await scoutSpendUsd(db)) >= opts.monthlyBudgetUsd;

  // 1. Cards.
  let cardQuery = db.from('cards').select('id, issuer, product_name, currency, annual_fee, source_url, checked_at').not('source_url', 'is', null);
  cardQuery = opts.cardIds ? cardQuery.in('id', opts.cardIds) : opts.priceIds ? cardQuery.in('id', []) : cardQuery.or(`checked_at.is.null,checked_at.lt.${cutoff}`);
  const { data: cards, error } = await cardQuery.order('checked_at', { ascending: true, nullsFirst: true }).limit(opts.cardIds?.length ?? opts.cardsPerRun ?? 2);
  if (error) throw new Error(`cards: ${error.message}`);

  for (const card of (cards ?? []) as { id: string; issuer: string; product_name: string; currency: string; annual_fee: number | null; source_url: string }[]) {
    if (await overBudget()) {
      reports.push({ kind: 'card', id: card.id, result: 'budget' });
      return reports;
    }
    const { data: rows } = await db.from('card_benefits').select('id, name, type, amount, period, status, source_url').eq('card_id', card.id).order('sort_order');
    const known = ((rows ?? []) as KnownBenefit[]).map((b) => ({ ...b, amount: b.amount === null ? null : Number(b.amount) }));
    const pages = [...new Set([card.source_url, ...known.map((b) => b.source_url).filter((u): u is string => !!u && sameSite(u, card.source_url) && !/\.pdf($|\?)/i.test(u))])].slice(0, PAGES_PER_CARD);

    let read = 0;
    let changed = 0;
    const notes: string[] = [];
    for (const url of pages) {
      const page = await readPage(url, opts.fetch);
      if (!page.ok) {
        notes.push(`${url}: ${page.error}`);
        continue;
      }
      let found: CardPage | null = null;
      try {
        found = parse(CardPageSchema, await ask(db, models.card, opts.model, cardMessage({ card: card.product_name, issuer: card.issuer, known: known.map((b) => ({ id: b.id, name: b.name, amount: b.amount, period: b.period })), text: page.text })));
      } catch {
        notes.push(`${url}: model call failed`);
        continue;
      }
      if (!found) {
        notes.push(`${url}: could not read the page`);
        continue;
      }
      read += 1;
      const c = checkCardPage(found, { page: page.text, pageUrl: url, card: { id: card.id, annual_fee: card.annual_fee === null ? null : Number(card.annual_fee) }, known, currency: card.currency });

      // Still on the page: a fresh "last checked" date (only verified perks get one).
      for (const x of c.confirmed) {
        const b = known.find((k) => k.id === x.id)!;
        await db
          .from('card_benefits')
          .update({ checked_at: nowIso, check_result: 'confirmed', evidence: x.evidence.slice(0, 1000), ...(b.status === 'active' ? { last_verified: today } : {}) })
          .eq('id', x.id);
      }
      if (c.notOnPage.length) await db.from('card_benefits').update({ checked_at: nowIso, check_result: 'not_on_page' }).in('id', c.notOnPage);

      // New perks with no dollar amount, in the page's own words.
      for (const p of c.newPerks) {
        const id = `${card.id}__scout_${p.slug}`;
        const { error: e } = await db.from('card_benefits').upsert(
          {
            id, card_id: card.id, type: p.type, name: p.name, period: 'per_claim', period_anchor: 'calendar', terms_summary: p.terms, enrollment_required: false,
            status: 'active', source_url: page.finalUrl, last_verified: today, origin: 'scout', evidence: p.evidence.slice(0, 1000), checked_at: nowIso, check_result: 'confirmed', sort_order: 900,
          },
          { onConflict: 'id', ignoreDuplicates: true },
        );
        if (e) {
          console.warn('new perk', id, e.message);
          continue;
        }
        await record(db, { kind: 'new_perk', card_id: card.id, benefit_id: id, summary: `Added: ${p.name}`, proposed: { name: p.name, type: p.type }, evidence: p.evidence, source_url: page.finalUrl, status: 'applied', decided_at: nowIso, dedupe_key: `new:${card.id}:${p.slug}` });
        changed += 1;
      }

      // Money: waits for a person.
      for (const ch of c.changes as Change[]) {
        await record(db, { kind: ch.kind, card_id: card.id, benefit_id: ch.benefitId, summary: ch.summary, current: ch.current, proposed: ch.proposed, evidence: ch.evidence, source_url: page.finalUrl, dedupe_key: ch.dedupeKey });
        changed += 1;
      }
    }
    const result = read === 0 ? 'unreachable' : changed ? 'changed' : 'confirmed';
    await db.from('cards').update({ checked_at: nowIso, check_result: result, check_note: notes.join('; ').slice(0, 500) || null }).eq('id', card.id);
    reports.push({ kind: 'card', id: card.id, result });
  }

  // 2. Prices behind perk values.
  let priceQuery = db.from('perk_prices').select('id, label, amount, currency, basis, source_url');
  priceQuery = opts.priceIds ? priceQuery.in('id', opts.priceIds) : opts.cardIds ? priceQuery.in('id', []) : priceQuery.or(`checked_at.is.null,checked_at.lt.${cutoff}`);
  const { data: prices, error: pErr } = await priceQuery.order('checked_at', { ascending: true, nullsFirst: true }).limit(opts.priceIds?.length ?? opts.pricesPerRun ?? 1);
  if (pErr) throw new Error(`perk_prices: ${pErr.message}`);

  for (const p of (prices ?? []) as { id: string; label: string; amount: number; currency: string; basis: string; source_url: string }[]) {
    if (await overBudget()) {
      reports.push({ kind: 'price', id: p.id, result: 'budget' });
      return reports;
    }
    const amount = Number(p.amount);
    const page = await readPage(p.source_url, opts.fetch);
    if (!page.ok) {
      await db.from('perk_prices').update({ checked_at: nowIso, check_result: 'unreachable', check_note: page.error }).eq('id', p.id);
      reports.push({ kind: 'price', id: p.id, result: `unreachable: ${page.error}` });
      continue;
    }
    let found: PricePage | null = null;
    try {
      found = parse(PricePageSchema, await ask(db, models.price, opts.model, priceMessage({ label: p.label, basis: p.basis, current: amount, currency: p.currency, text: page.text })));
    } catch {
      found = null;
    }
    const c = found ? checkPricePage(found, { page: page.text, price: { amount, currency: p.currency } }) : ({ result: 'not_on_page', reason: 'could not read the page' } as const);
    if (c.result === 'confirmed') {
      await db.from('perk_prices').update({ last_verified: today, evidence: c.evidence, checked_at: nowIso, check_result: 'confirmed', check_note: null }).eq('id', p.id);
    } else if (c.result === 'updated') {
      // The trigger re-values every perk that uses this price.
      await db.from('perk_prices').update({ amount: c.amount, last_verified: today, evidence: c.evidence, checked_at: nowIso, check_result: 'updated', check_note: `was ${amount}` }).eq('id', p.id);
      await record(db, { kind: 'price_changed', price_id: p.id, summary: `${p.label}: ${amount} → ${c.amount} ${p.currency}`, current: { amount }, proposed: { amount: c.amount }, evidence: c.evidence, source_url: page.finalUrl, status: 'applied', decided_at: nowIso, dedupe_key: `price:${p.id}:${c.amount}` });
    } else if (c.result === 'changed') {
      await db.from('perk_prices').update({ checked_at: nowIso, check_result: 'changed', check_note: `page says ${c.amount}` }).eq('id', p.id);
      await record(db, { kind: 'price_changed', price_id: p.id, summary: `${p.label}: ${amount} → ${c.amount} ${p.currency} (big change: check it)`, current: { amount }, proposed: { amount: c.amount }, evidence: c.evidence, source_url: page.finalUrl, dedupe_key: `price:${p.id}:${c.amount}` });
    } else {
      await db.from('perk_prices').update({ checked_at: nowIso, check_result: 'not_on_page', check_note: c.reason }).eq('id', p.id);
      await record(db, { kind: 'price_unconfirmed', price_id: p.id, summary: `${p.label}: price not found on the page (${c.reason})`, current: { amount }, proposed: null, evidence: null, source_url: page.finalUrl, dedupe_key: `price_gone:${p.id}` });
    }
    reports.push({ kind: 'price', id: p.id, result: c.result });
  }
  return reports;
}
