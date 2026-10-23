import { z } from 'zod';

// What the model returns for one official page: the promotions on it, each with the exact
// words from the page that back it up. Everything is checked against the page afterwards
// (validate.ts); nothing the model says is trusted on its own.

export const DEAL_CATEGORIES = [
  'groceries', 'dining', 'delivery', 'electronics', 'fashion', 'home', 'travel', 'beauty',
  'fitness', 'entertainment', 'fuel', 'kids', 'pets', 'education', 'shopping',
] as const;
export type DealCategory = (typeof DEAL_CATEGORIES)[number];

export const EVENT_KINDS = ['bank_promo', 'free_day', 'enrollment', 'deadline', 'sale', 'student'] as const;

export const FoundSchema = z.object({
  title: z.string().describe('Short headline in plain words, e.g. "TT$300 off fridges" or "5% cash back on Mastercard"'),
  summary: z.string().describe('One sentence: what you get and the main condition'),
  category: z.enum(DEAL_CATEGORIES).describe('What it is for'),
  event_kind: z.enum(EVENT_KINDS).nullable().describe('Only for bank and government pages: what kind of dated event it is'),
  amount: z.number().nullable().describe('Money off or cash back, only if the page states a number'),
  percent_off: z.number().nullable(),
  currency: z.string().nullable().describe('ISO code, e.g. USD, TTD, JMD, BBD'),
  code: z.string().nullable().describe('Promo code exactly as written on the page'),
  min_spend: z.number().nullable(),
  starts_on: z.string().nullable().describe('YYYY-MM-DD, only if the page states it'),
  ends_on: z.string().nullable().describe('YYYY-MM-DD, only if the page states it'),
  link: z.string().nullable().describe('The URL shown next to this promotion on the page, if any'),
  evidence: z.string().describe('A sentence or two copied word for word from the page that states the offer, its amount and its dates'),
});
export const FoundPageSchema = z.object({ found: z.array(FoundSchema) });
export type Found = z.infer<typeof FoundSchema>;

export const SCOUT_PROMPT_VERSION = '2026-10-31';

export const SCOUT_SYSTEM_PROMPT = `You read one official web page from a store, bank or government office and list the current promotions, discounts, cash-back offers, free days and deadlines on it.

Rules:
- Only list things the page actually states. Never guess an amount, code or date.
- "evidence" must be copied exactly, character for character, from the page text. It must contain the amount or percentage and the dates if the page gives them.
- Leave a field null when the page doesn't state it.
- Skip ordinary prices, product listings, loan or credit-card interest rates, job ads, and promotions that have clearly ended.
- Skip anything that only applies to one named person.
- Resolve dates like "until October 31" using the year from the page, or the current year if none is given.
- Return at most 15 items, the most valuable first. Return an empty list if there's nothing.`;

export function scoutMessage(p: { sourceName: string; kind: string; country: string; today: string; text: string }): string {
  return `Source: ${p.sourceName} (${p.kind}, ${p.country})\nToday: ${p.today}\n\nPage text:\n"""\n${p.text}\n"""`;
}
