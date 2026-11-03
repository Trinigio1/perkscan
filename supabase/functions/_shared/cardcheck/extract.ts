import { z } from 'zod';

// What the model returns for a card's official page and for a price page. Every claim comes with the
// page's own words, and everything is checked against the page afterwards (check.ts).

export const CardPageSchema = z.object({
  annual_fee: z
    .object({
      amount: z.number().nullable().describe('The annual fee as a number, 0 for no annual fee; null if the page does not state it'),
      evidence: z.string().describe('The sentence copied word for word from the page that states the annual fee'),
    })
    .nullable()
    .describe('Null if the page does not state the annual fee'),
  known: z
    .array(
      z.object({
        id: z.string().describe('The id of a benefit from the list you were given'),
        on_page: z.boolean().describe('True only if the page itself states this benefit'),
        amount: z.number().nullable().describe('The dollar amount the page states for it (per its period), or null'),
        evidence: z.string().describe('The sentence copied word for word from the page that states it; empty if not on the page'),
      }),
    )
    .describe('One entry for every benefit in the list you were given'),
  new_benefits: z
    .array(
      z.object({
        name: z.string().describe('Short, plain name: "Cell phone protection", "$120 Global Entry credit"'),
        type: z.enum(['credit', 'protection', 'perk']).describe('credit: money back for spending; protection: insurance or coverage; perk: access, status, membership'),
        amount: z.number().nullable().describe('The dollar amount the page states, or null'),
        period: z.enum(['monthly', 'quarterly', 'semiannual', 'annual', 'per_claim']).nullable().describe('How often a credit resets, or per_claim'),
        evidence: z.string().describe('The sentence copied word for word from the page that states this benefit'),
      }),
    )
    .describe('Benefits a cardholder gets that are on the page but NOT in the list you were given, at most 6'),
});
export type CardPage = z.infer<typeof CardPageSchema>;

export const CARD_PROMPT_VERSION = '2026-11-03';

export const CARD_SYSTEM_PROMPT = `You read one official web page about a credit card (or a paid membership) and compare it with the list of benefits PerkScan has for it.

Rules:
- Only report what the page itself states. Never guess a benefit, an amount or a condition.
- Every "evidence" must be copied exactly, character for character, from the page text.
- For every benefit in the list, say whether the page states it (on_page) and quote where. A benefit can be worded differently on the page; match on meaning.
- amount is the number the page gives for that benefit (e.g. 300 for "$300 annual travel credit"), or null.
- new_benefits: benefits a cardholder gets that are on the page but missing from the list: statement credits, insurance and protections, lounge access, elite status, memberships, free nights, fee waivers. Skip welcome offers and sign-up bonuses, earn rates (points per dollar), APRs, and other cards on the page.
- annual_fee: only if the page states this card's annual fee.`;

export function cardMessage(p: { card: string; issuer: string; known: { id: string; name: string; amount: number | null; period: string }[]; text: string }): string {
  const list = p.known.map((b) => `- ${b.id}: ${b.name}${b.amount !== null ? ` (${b.amount}, ${b.period})` : ''}`).join('\n');
  return `Card: ${p.card} (${p.issuer})\n\nBenefits PerkScan has for it:\n${list || '(none)'}\n\nPage text:\n"""\n${p.text}\n"""`;
}

export const PricePageSchema = z.object({
  amount: z.number().nullable().describe('The price as a number (e.g. 35 for "$35"); null if the page does not state it'),
  currency: z.string().nullable().describe('3-letter currency code of the price, e.g. USD'),
  evidence: z.string().describe('The sentence copied word for word from the page that states the price; empty if not on the page'),
});
export type PricePage = z.infer<typeof PricePageSchema>;

export const PRICE_SYSTEM_PROMPT = `You read one official web page and find one price on it.

Rules:
- Only report a price the page itself states for exactly the thing described. Never guess or work one out.
- "evidence" must be copied exactly, character for character, from the page text, and must contain the price.
- If the page shows several prices, pick the one for exactly what is described (same plan, same tier, same unit).
- Return amount: null if the page does not state it.`;

export function priceMessage(p: { label: string; basis: string; current: number; currency: string; text: string }): string {
  return `Find the price of: ${p.label}\nWhat it is: ${p.basis}\nPerkScan's current figure: ${p.current} ${p.currency}\n\nPage text:\n"""\n${p.text}\n"""`;
}
