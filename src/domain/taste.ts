import { interestLabel, type Deal, type DealFeedback, type Interest } from './deals';
import { interestsFor, offerInterests } from './interests';
import type { Program } from './programs';
import type { Opportunity } from './types';

// What PerkScan has learned you like, from what you do — not just what you picked once:
// deals you save (+1) or hide (−1), offers you actually use (+2), perks you say you have (+1) or
// don't want (−1). Per interest; "Everything else" is too broad to learn. Pure, so tested.

export interface Taste {
  /** Interests you've shown you like, strongest first, with their score. */
  liked: [Interest, number][];
  /** Interests you've shown you don't. */
  disliked: [Interest, number][];
}

export interface TasteInput {
  dealFeedback: DealFeedback[];
  deals: Pick<Deal, 'id' | 'merchant' | 'title' | 'summary' | 'category'>[];
  /** Your offers: used ones count. */
  opportunities: Pick<Opportunity, 'status' | 'interest' | 'merchant' | 'title'>[];
  perkFeedback: { program_id: string; action: 'have' | 'dismissed' }[];
  programs: Pick<Program, 'id' | 'interests'>[];
}

export function learnTaste(d: TasteInput): Taste {
  const score = new Map<Interest, number>();
  const bump = (tags: readonly string[], n: number) => {
    for (const t of new Set(tags)) if (t !== 'shopping') score.set(t as Interest, (score.get(t as Interest) ?? 0) + n);
  };
  const dealById = new Map(d.deals.map((x) => [x.id, x]));
  for (const f of d.dealFeedback) {
    const deal = dealById.get(f.deal_id);
    if (!deal || f.action === 'didnt_work') continue; // didn't work is about the store's terms, not your taste
    bump(interestsFor({ category: deal.category, merchant: deal.merchant, title: deal.title, summary: deal.summary }), f.action === 'saved' ? 1 : -1);
  }
  for (const o of d.opportunities) if (o.status === 'claimed') bump(offerInterests(o), 2);
  const programById = new Map(d.programs.map((p) => [p.id, p]));
  for (const f of d.perkFeedback) bump(programById.get(f.program_id)?.interests ?? [], f.action === 'have' ? 1 : -1);

  const all = [...score].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return { liked: all.filter(([, n]) => n > 0), disliked: all.filter(([, n]) => n < 0) };
}

/** "Delivery and fitness": the top liked interests, for "PerkScan learned you like …". */
export function tasteLine(t: Taste, max = 3): string | null {
  const names = t.liked.slice(0, max).map(([i]) => interestLabel(i).toLowerCase());
  if (!names.length) return null;
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
