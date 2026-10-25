import type { CardBenefit } from './types';

// "Your card perks": everything besides credits, grouped by when you'd use it.

export type PerkGroup = 'airport' | 'travel' | 'status' | 'rewards' | 'shopping' | 'card';

export const PERK_GROUPS: { group: PerkGroup; title: string }[] = [
  { group: 'airport', title: 'At the airport' },
  { group: 'travel', title: 'When you travel' },
  { group: 'status', title: 'Status and concierge' },
  { group: 'rewards', title: 'Rewards' },
  { group: 'shopping', title: 'Shopping protections' },
  { group: 'card', title: 'Card services' },
];

// Matched against the benefit key (the part after "__" in the id), first match wins.
const RULES: [RegExp, PerkGroup][] = [
  [/lounge|global_entry|clear|airport|checked_bag|club_passes/, 'airport'],
  [/trip_|baggage|rental_car|travel_(insurance|medical|accident|credit)|emergency_medical|flight_credit|companion/, 'travel'],
  [/status|elite|free_night|concierge|hotel_perks|entertainment_access|dashpass/, 'status'],
  [/cash|miles|points|reward|rotating|match|discount/, 'rewards'],
  [/protection|warranty|cell_phone|returns|shipping/, 'shopping'],
];

/** Which group a non-credit benefit belongs in. */
export function perkGroup(b: Pick<CardBenefit, 'id' | 'type'>): PerkGroup {
  const key = b.id.split('__')[1] ?? '';
  for (const [re, group] of RULES) if (re.test(key)) return group;
  return b.type === 'protection' ? 'shopping' : 'card';
}

export interface PerkLine {
  benefit: CardBenefit;
  /** The user's cards that have it, e.g. ["Amex Platinum ·· 1001"]. */
  cards: string[];
}

/**
 * The perks across the user's cards, by group. Credits are left out (they have their own screen),
 * and a perk on two of your cards is listed once per card product with both cards named.
 */
export function groupPerks(
  userCards: { id: string; card_id: string }[],
  benefits: CardBenefit[],
  cardLabel: (userCardId: string) => string,
): { group: PerkGroup; title: string; lines: PerkLine[] }[] {
  const lines = new Map<string, PerkLine>();
  for (const uc of userCards) {
    for (const b of benefits) {
      if (b.card_id !== uc.card_id || b.type === 'credit') continue;
      const line = lines.get(b.id) ?? { benefit: b, cards: [] };
      line.cards.push(cardLabel(uc.id));
      lines.set(b.id, line);
    }
  }
  // Verified perks first, then by name.
  const sorted = [...lines.values()].sort(
    (a, b) => Number(b.benefit.status === 'active') - Number(a.benefit.status === 'active') || a.benefit.name.localeCompare(b.benefit.name),
  );
  return PERK_GROUPS.map((g) => ({ ...g, lines: sorted.filter((l) => perkGroup(l.benefit) === g.group) })).filter((g) => g.lines.length);
}

/** Cards of yours that get you into an airport lounge (verified or not). */
export function loungeCards(groups: ReturnType<typeof groupPerks>): string[] {
  const airport = groups.find((g) => g.group === 'airport');
  return [...new Set((airport?.lines ?? []).filter((l) => /lounge/.test(l.benefit.id)).flatMap((l) => l.cards))];
}
