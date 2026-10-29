import type { PageSpec } from '../scout/discover.ts';
import { sameSite } from '../scout/page.ts';

// Where a store keeps its rewards program: /rewards, /loyalty, /membership and the like.

const PERK_PATH = /(reward|loyalty|perks|member|birthday|club|insider)/i;
const NOT_A_PAGE = /(\/p\/|\/product|\/item|\/blog|\/news|\/press|\/career|\/job|terms|condition|privacy|faq|credit-?card|\.pdf$|\.jpg$|\.png$)/i;

/** The best-looking rewards page among a site's addresses, or null. Short, top-level, clearly named wins. */
export function bestPerkUrl(urls: string[], site: string): string | null {
  const scored = urls
    .filter((u) => u.startsWith('https://') && sameSite(u, site))
    .map((u) => {
      let path: string;
      try {
        path = new URL(u).pathname.toLowerCase();
      } catch {
        return null;
      }
      if (!PERK_PATH.test(path) || NOT_A_PAGE.test(path)) return null;
      const depth = path.split('/').filter(Boolean).length;
      const named = /\/(rewards?|loyalty|rewards-program|perks|membership)\/?$/.test(path) ? 10 : 0;
      return { u, score: named - depth * 2 - path.length / 40 };
    })
    .filter((x): x is { u: string; score: number } => !!x)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.u ?? null;
}

export const PERK_SPEC: PageSpec = {
  best: bestPerkUrl,
  commonPaths: ['/rewards', '/loyalty', '/rewards-program', '/perks', '/membership', '/birthday'],
  words: /\breward|\bpoints?\b|\bbirthday|\bmember|\bjoin\b|\bfree\b|\bperks?\b/gi,
  minWords: 4,
  what: 'rewards',
};
