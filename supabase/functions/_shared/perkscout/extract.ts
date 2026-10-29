import { z } from 'zod';

// What the model returns for a store's rewards page: the free program on it, if any, with the page's
// own words for every claim. Everything is checked against the page afterwards (check.ts).

export const PerkPageSchema = z.object({
  program: z
    .object({
      name: z.string().describe('The program’s name as the page writes it, e.g. "Chipotle Rewards"'),
      free_to_join: z.boolean().describe('True only if the page says joining is free'),
      join_evidence: z.string().describe('The sentence copied word for word from the page that says joining is free'),
      how_to_join: z.string().describe('One short sentence: how to join (app, website, in store)'),
      perks: z
        .array(
          z.object({
            title: z.string().describe('Short, plain: "Free birthday drink", "10 points per $1"'),
            evidence: z.string().describe('The sentence copied word for word from the page that states this perk'),
          }),
        )
        .describe('What members get, most valuable first, at most 6'),
    })
    .nullable()
    .describe('Null if the page has no free rewards or loyalty program'),
});
export type PerkPage = z.infer<typeof PerkPageSchema>;

export const PERK_PROMPT_VERSION = '2026-11-15';

export const PERK_SYSTEM_PROMPT = `You read one official web page from a store or restaurant and describe its free rewards or loyalty program, if it has one.

Rules:
- Only describe what the page actually states. Never guess a perk, amount or condition.
- Every "evidence" and "join_evidence" must be copied exactly, character for character, from the page text.
- free_to_join is true only if the page says joining is free (or costs nothing). A paid membership is not free to join.
- List the perks members get: birthday rewards, welcome rewards, points, free items, member prices. Skip contests, sweepstakes, credit cards and paid tiers.
- Return program: null if there is no free program on the page.`;

export function perkMessage(p: { store: string; domain: string; text: string }): string {
  return `Store: ${p.store} (${p.domain})\n\nPage text:\n"""\n${p.text}\n"""`;
}
