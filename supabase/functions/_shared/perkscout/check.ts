import { norm, numbersIn } from '../scout/validate.ts';
import type { PerkPage } from './extract.ts';

// The gates a scouted perk program passes before anyone sees it:
//   - it's free to join, in the page's own words
//   - every perk's quote is really on the official page, and every number in its headline is in that quote
//   - its name is on the page
// Programs whose perks state a dollar amount are held for a person to approve ("never invent amounts":
// a quote can be right and still be read wrong). Pure, so every rule is tested.

export interface ScoutedProgram {
  name: string;
  summary: string;
  how_to: string;
  evidence: string;
  /** A perk states a dollar amount: held for review before anyone sees it. */
  hasMoney: boolean;
}

export type PerkCheck = { ok: true; value: ScoutedProgram } | { ok: false; reason: string };

const FREE = /\bfree\b|no cost|\$0\b|at no charge|costs? nothing|complimentary/i;
const MONEY = /[$€£]\s?\d|\b\d+(?:\.\d+)?\s?(?:dollars?|usd|ttd)\b/i;

const quoteOk = (page: string, q: string) => {
  const n = norm(q);
  return n.length >= 12 && q.length <= 400 && page.includes(n);
};

export function checkPerkPage(found: PerkPage, ctx: { page: string; domain: string }): PerkCheck {
  const p = found.program;
  if (!p) return { ok: false, reason: 'no free program' };
  const page = norm(ctx.page);
  const name = p.name.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (name.length < 3 || !page.includes(norm(name))) return { ok: false, reason: 'name not on page' };
  if (!p.free_to_join || !quoteOk(page, p.join_evidence) || !FREE.test(p.join_evidence)) return { ok: false, reason: 'not free to join' };

  const perks = p.perks
    .map((x) => ({ title: x.title.replace(/\s+/g, ' ').trim().slice(0, 80), evidence: x.evidence.replace(/\s+/g, ' ').trim() }))
    .filter((x) => x.title && quoteOk(page, x.evidence))
    // No number in the headline that its quote doesn't contain.
    .filter((x) => numbersIn(x.title).every((n) => numbersIn(x.evidence).some((y) => Math.abs(y - n) < 0.005)))
    .slice(0, 4);
  if (!perks.length) return { ok: false, reason: 'no perk backed by the page' };

  // How to join: the model's sentence if every number in it is on the page, else a plain default.
  const how = p.how_to_join.replace(/\s+/g, ' ').trim().slice(0, 200);
  const how_to = how && numbersIn(how).every((n) => numbersIn(ctx.page).some((y) => Math.abs(y - n) < 0.005)) ? how : `Join free on ${ctx.domain}.`;

  return {
    ok: true,
    value: {
      name,
      summary: `Free to join. ${perks.map((x) => x.title).join('; ')}.`.slice(0, 300),
      how_to,
      evidence: [p.join_evidence.trim(), ...perks.map((x) => x.evidence)].join(' … ').slice(0, 1500),
      hasMoney: perks.some((x) => MONEY.test(x.title) || MONEY.test(x.evidence)),
    },
  };
}
