import { siblingCards } from './cardDraft';
import { formatMoney, shortCardName } from './format';
import type { Card, CardBenefit, Opportunity, Recovered, Receipt, UserCard } from './types';
import { annualCreditValue } from './worthIt';

// Money moves: things you can do this week that keep money in your pocket, found from what PerkScan
// already knows (your cards, memberships and receipts). Each one says why, in the card's own terms, and
// what to do. Money only counts once you confirm it, with the amount you saw: nothing is assumed.
//
//   1. You already have this: phone insurance on your phone bill when your card covers your phone; the
//      rental-car counter's damage waiver; a store protection plan or trip insurance you just bought.
//   2. Points about to expire at places you use.
//   4. Annual fee day: what the card gave you against its fee, and your options, before the fee posts.
//   5. Recalls on things you bought (with the maker's refund or replacement), and appliance rebates.
// Pure, so every rule is tested.

export type MoveKind = 'phone_insurance' | 'rental_waiver' | 'protection_plan' | 'trip_insurance' | 'annual_fee' | 'recall' | 'rebate' | 'points';

export interface Move {
  /** Stable id; also the key of the saving when you confirm it. */
  key: string;
  kind: MoveKind;
  title: string;
  /** Why, in a sentence or two, with the card's own terms. */
  why: string;
  steps: string[];
  /** The money at stake when PerkScan knows it (the charge, the plan's price, the fee); null when you'll tell us. */
  amount: number | null;
  currency: string;
  /** How the saving repeats once done. */
  per: 'once' | 'month' | 'year';
  /** The button that records it: "I dropped it". */
  confirmLabel: string;
  /** Official page to act on, if any. */
  url: string | null;
  /** Act by: the pickup date, the fee date, the expiry. */
  by: string | null;
  /** Points are marked used on the item itself (the usual "used" flow), not as a saving. */
  opportunityId?: string;
}

export interface ItemReceipt extends Pick<Receipt, 'id' | 'merchant' | 'total' | 'currency' | 'purchase_date' | 'purchase_type' | 'matched_user_card_id' | 'travel_date'> {
  items: { name: string; price: number | null; quantity?: number | null }[];
}

export interface ProductRecall {
  id: string;
  recall_date: string;
  title: string;
  url: string;
  products: { name: string; model?: string | null }[];
  manufacturers: string[];
  remedies: string[];
}

interface Cover {
  userCardId: string;
  label: string;
  benefit: Pick<CardBenefit, 'id' | 'name' | 'terms_summary' | 'source_url'>;
}

const DAY = 86_400_000;
const key = (b: Pick<CardBenefit, 'id'>) => b.id.split('__')[1] ?? '';
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
const daysBetween = (a: Date, iso: string) => (new Date(`${iso.slice(0, 10)}T12:00:00`).getTime() - a.getTime()) / DAY;
const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Your cards that carry a kind of protection (verified terms only: never advice on a guess). */
export function coversFor(
  kinds: string[],
  userCards: Pick<UserCard, 'id' | 'card_id' | 'last_four' | 'nickname'>[],
  cards: Pick<Card, 'id' | 'kind' | 'product_name'>[],
  benefits: Pick<CardBenefit, 'id' | 'card_id' | 'name' | 'status' | 'terms_summary' | 'source_url'>[],
): Cover[] {
  const out: Cover[] = [];
  for (const uc of userCards) {
    const card = cards.find((c) => c.id === uc.card_id);
    if (!card || card.kind === 'membership') continue;
    // The most relevant cover first: kinds are listed in order of preference.
    const b = kinds.map((k) => benefits.find((x) => x.card_id === card.id && x.status === 'active' && key(x) === k)).find(Boolean);
    if (!b) continue;
    out.push({ userCardId: uc.id, label: uc.nickname || `${shortCardName(card.product_name)}${uc.last_four ? ` ·· ${uc.last_four}` : ''}`, benefit: b });
  }
  return out;
}

const PHONE_INSURANCE = /mobile protect|protection\s*<?\s*360|protect advantage|device protection|phone insurance|equipment protection|total mobile protection|\basurion\b/i;

/** 1a. Phone insurance on your bill (or from Asurion) while a card of yours covers your phone. */
export function phoneInsuranceMoves(receipts: ItemReceipt[], covers: Cover[], now: Date): Move[] {
  if (!covers.length) return [];
  const since = now.getTime() - 75 * DAY;
  const found = new Map<string, { amount: number; currency: string; merchant: string; paidWith: string | null; date: string }>();
  for (const r of receipts) {
    if (!r.purchase_date || new Date(r.purchase_date).getTime() < since) continue;
    const lines = r.items.filter((i) => PHONE_INSURANCE.test(i.name) && i.price && i.price > 0);
    if (PHONE_INSURANCE.test(r.merchant) && r.total && !lines.length) lines.push({ name: r.merchant, price: r.total });
    for (const line of lines) {
      const k = slug(r.merchant);
      const prev = found.get(k);
      if (!prev || prev.date < r.purchase_date) found.set(k, { amount: line.price!, currency: r.currency, merchant: r.merchant, paidWith: r.matched_user_card_id, date: r.purchase_date });
    }
  }
  return [...found.entries()].map(([k, f]) => {
    const payer = covers.find((c) => c.userCardId === f.paidWith);
    const cover = payer ?? covers[0]!;
    const money = formatMoney(f.amount, { currency: f.currency });
    return {
      key: `phone_insurance:${k}`,
      kind: 'phone_insurance',
      title: `You pay ${money} a month for phone insurance your ${cover.label} may already give you`,
      why: `${cover.benefit.name}: ${cover.benefit.terms_summary ?? 'see the card’s terms'}`,
      steps: [
        payer ? `You already pay your ${f.merchant} bill with this card.` : `Coverage usually needs the monthly phone bill paid with the card: switch your ${f.merchant} autopay to your ${cover.label}.`,
        'Compare before you cancel: card coverage has a deductible and a per-claim limit, and may not cover loss.',
        `Then remove the protection add-on in your ${f.merchant} account.`,
      ],
      amount: f.amount,
      currency: f.currency,
      per: 'month',
      confirmLabel: 'I dropped it',
      url: cover.benefit.source_url,
      by: null,
    } satisfies Move;
  });
}

/** 1b. A car rental coming up: decline the counter's damage waiver if your card covers it. */
export function rentalWaiverMoves(receipts: ItemReceipt[], covers: Cover[], now: Date): Move[] {
  if (!covers.length) return [];
  return receipts
    .filter((r) => r.purchase_type === 'car_rental' && r.travel_date && daysBetween(now, r.travel_date) >= -1 && daysBetween(now, r.travel_date) <= 60)
    .map((r) => {
      const payer = covers.find((c) => c.userCardId === r.matched_user_card_id);
      const cover = payer ?? covers[0]!;
      return {
        key: `rental_waiver:${r.id}`,
        kind: 'rental_waiver',
        title: `${r.merchant} pickup ${longDate(r.travel_date!)}: you may not need the counter’s damage waiver`,
        why: `${cover.benefit.name} on your ${cover.label}: ${cover.benefit.terms_summary ?? 'see the card’s terms'}`,
        steps: [
          payer ? 'You booked with this card. Pay for the whole rental with it at the counter too.' : `Coverage usually needs the whole rental paid with the card: pay with your ${cover.label}.`,
          'Decline the collision / loss damage waiver at the counter (coverage often requires declining it).',
          'Check the card’s terms for excluded countries, vehicle types and rental length.',
        ],
        amount: null,
        currency: r.currency,
        per: 'once',
        confirmLabel: 'I declined it',
        url: cover.benefit.source_url,
        by: r.travel_date!,
      } satisfies Move;
    });
}

const PROTECTION_PLAN = /protection plan|geek squad|\ballstate\b|squaretrade|\basurion\b|extended warranty|accident protection|product protection|care plan|service plan/i;
const TRIP_INSURANCE = /trip (insurance|protection)|travel (insurance|protection)|\ballianz\b|travel guard|\bgenerali\b|squaremouth|insuremytrip|trip cancellation (insurance|cover)/i;

/** 1c. A store protection plan you just bought, when your card already extends the warranty. */
export function protectionPlanMoves(receipts: ItemReceipt[], covers: Cover[], now: Date): Move[] {
  if (!covers.length) return [];
  const out: Move[] = [];
  for (const r of receipts) {
    if (!r.purchase_date || daysBetween(now, r.purchase_date) < -45 || r.purchase_type === 'phone_bill') continue;
    r.items.forEach((line, i) => {
      if (!PROTECTION_PLAN.test(line.name) || !line.price || line.price <= 0) return;
      const cover = covers.find((c) => c.userCardId === r.matched_user_card_id) ?? covers[0]!;
      const money = formatMoney(line.price, { currency: r.currency });
      out.push({
        key: `protection_plan:${r.id}:${i}`,
        kind: 'protection_plan',
        title: `You paid ${money} for a protection plan at ${r.merchant}`,
        why: `${cover.benefit.name} on your ${cover.label}: ${cover.benefit.terms_summary ?? 'see the card’s terms'}`,
        steps: [
          cover.userCardId === r.matched_user_card_id ? 'You paid with this card, so its warranty extension should apply.' : `Card coverage needs the item paid with the card; this one was paid with ${r.matched_user_card_id ? 'another card' : 'a card PerkScan didn’t match'}.`,
          'Compare: store plans can cover more (accidents, batteries); your card extends the maker’s warranty.',
          'Many stores let you cancel a plan for a refund within a set time: check the plan’s terms soon.',
        ],
        amount: line.price,
        currency: r.currency,
        per: 'once',
        confirmLabel: 'I cancelled it',
        url: cover.benefit.source_url,
        by: null,
      });
    });
  }
  return out;
}

/** 1d. Trip insurance you bought when a card of yours covers delays, cancellations and bags. */
export function tripInsuranceMoves(receipts: ItemReceipt[], covers: Cover[], now: Date): Move[] {
  if (!covers.length) return [];
  const out: Move[] = [];
  for (const r of receipts) {
    if (!r.purchase_date || daysBetween(now, r.purchase_date) < -60) continue;
    const lines = r.items.filter((i) => TRIP_INSURANCE.test(i.name) && i.price && i.price > 0);
    if (TRIP_INSURANCE.test(r.merchant) && r.total && !lines.length) lines.push({ name: r.merchant, price: r.total });
    lines.forEach((line, i) => {
      const names = [...new Set(covers.map((c) => c.benefit.name))].join(', ');
      out.push({
        key: `trip_insurance:${r.id}:${i}`,
        kind: 'trip_insurance',
        title: `You paid ${formatMoney(line.price!, { currency: r.currency })} for trip insurance`,
        why: `Your ${covers[0]!.label} has ${names}. ${covers[0]!.benefit.terms_summary ?? ''}`.trim(),
        steps: [
          'Card cover usually needs the trip paid with the card.',
          'Compare: bought policies can add medical cover and “cancel for any reason”; card cover is narrower.',
          'Many policies have a review period for a full refund: check yours before it ends.',
        ],
        amount: line.price!,
        currency: r.currency,
        per: 'once',
        confirmLabel: 'I cancelled it',
        url: covers[0]!.benefit.source_url,
        by: null,
      });
    });
  }
  return out;
}

/** 2. Points or rewards at places you use, expiring within a month. Marked used the usual way. */
export function expiringPointsMoves(opportunities: Pick<Opportunity, 'id' | 'type' | 'status' | 'title' | 'merchant' | 'expires_at' | 'value_estimate' | 'currency'>[], now: Date, days = 30): Move[] {
  return opportunities
    .filter((o) => o.type === 'points' && o.status === 'open' && o.expires_at && new Date(o.expires_at).getTime() > now.getTime() && new Date(o.expires_at).getTime() - now.getTime() <= days * DAY)
    .sort((a, b) => a.expires_at!.localeCompare(b.expires_at!))
    .map((o) => ({
      key: `points:${o.id}`,
      kind: 'points',
      title: `${o.title}${o.merchant && !o.title.toLowerCase().includes(o.merchant.toLowerCase()) ? ` at ${o.merchant}` : ''}: use by ${longDate(o.expires_at!)}`,
      why: o.value_estimate !== null ? `Worth ${formatMoney(o.value_estimate, { currency: o.currency })}, and gone after the date.` : 'They expire after the date.',
      steps: ['Redeem them on your next visit or in the app, or make a small purchase if that keeps them active.'],
      amount: o.value_estimate,
      currency: o.currency,
      per: 'once',
      confirmLabel: 'I used them',
      url: null,
      by: o.expires_at!.slice(0, 10),
      opportunityId: o.id,
    }));
}

/** When a card's next annual fee is due: its open date's next anniversary. */
export function nextFeeDate(openDate: string, now: Date): Date {
  const [y, m, d] = openDate.slice(0, 10).split('-').map(Number) as [number, number, number];
  let year = now.getFullYear();
  let at = new Date(year, m - 1, d, 12);
  if (at.getTime() < now.getTime() - DAY) at = new Date(++year, m - 1, d, 12);
  // A card opened this year has no fee due until next year.
  if (year === y) at = new Date(y + 1, m - 1, d, 12);
  return at;
}

/** 4. Annual fee day, within 45 days: what the card gave back against its fee, and the options. */
export function feeDayMoves(
  userCards: Pick<UserCard, 'id' | 'card_id' | 'last_four' | 'open_date' | 'nickname'>[],
  cards: Pick<Card, 'id' | 'kind' | 'issuer' | 'product_name' | 'country' | 'currency' | 'annual_fee'>[],
  benefits: Pick<CardBenefit, 'id' | 'card_id' | 'type' | 'amount' | 'period' | 'amount_schedule' | 'status'>[],
  opportunities: Pick<Opportunity, 'id' | 'type' | 'user_card_id'>[],
  recovered: Pick<Recovered, 'opportunity_id' | 'amount' | 'recovered_at'>[],
  now: Date,
): Move[] {
  const out: Move[] = [];
  for (const uc of userCards) {
    const card = cards.find((c) => c.id === uc.card_id);
    if (!card || card.kind === 'membership' || !card.annual_fee || !uc.open_date) continue;
    const due = nextFeeDate(uc.open_date, now);
    const days = (due.getTime() - now.getTime()) / DAY;
    if (days < -1 || days > 45) continue;
    const fee = card.annual_fee;
    const money = (n: number) => formatMoney(n, { currency: card.currency });
    const credits = new Set(opportunities.filter((o) => o.type === 'card_credit' && o.user_card_id === uc.id).map((o) => o.id));
    const used = recovered.filter((r) => r.opportunity_id && credits.has(r.opportunity_id) && now.getTime() - new Date(r.recovered_at).getTime() <= 365 * DAY).reduce((n, r) => n + r.amount, 0);
    const offered = benefits.filter((b) => b.card_id === card.id && b.type === 'credit' && b.status === 'active').reduce((n, b) => n + (annualCreditValue(b) ?? 0), 0);
    const cheaper = siblingCards(card, cards).filter((s) => s.annual_fee !== null && s.annual_fee < fee).sort((a, b) => a.annual_fee! - b.annual_fee!)[0];
    const label = uc.nickname || `${shortCardName(card.product_name)}${uc.last_four ? ` ·· ${uc.last_four}` : ''}`;
    const year = due.getFullYear();
    out.push({
      key: `annual_fee:${uc.id}:${year}`,
      kind: 'annual_fee',
      title: `Your ${money(fee)} ${label} fee is due around ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      why: `In the last 12 months you used ${money(used)} of its credits${offered ? ` (it offers ${money(offered)} a year)` : ''}, against a ${money(fee)} fee.`,
      steps: [
        `Ask ${card.issuer} before the fee posts: “My annual fee is coming up. Are there any offers to keep the card, or can the fee be waived?”`,
        cheaper
          ? `If it’s not worth it to you: ask about switching to the ${shortCardName(cheaper.product_name)} (${cheaper.annual_fee === 0 ? 'no annual fee' : `${money(cheaper.annual_fee!)} fee`}) — switching usually keeps your account history.`
          : 'If it’s not worth it to you: ask which no-fee card you could switch to, so the account stays open.',
        'Many issuers refund the fee if you close or switch within a set time after it posts: check your card’s terms.',
      ],
      amount: fee,
      currency: card.currency,
      per: 'once',
      confirmLabel: 'Fee waived, offer or switch',
      url: null,
      by: due.toISOString().slice(0, 10),
    });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const STOP = new Set(['the', 'and', 'with', 'for', 'of', 'inc', 'llc', 'co', 'ltd', 'corp', 'company', 'recalls', 'recall', 'due', 'to', 'hazard', 'in', 'by', 'sold', 'exclusively', 'at']);

/** A model number worth matching on: at least 4 characters with a digit and a letter or a dash. */
export function modelTokens(model: string | null | undefined): string[] {
  if (!model) return [];
  return model
    .split(/[\s,;/]+|\band\b/i)
    .map((t) => squash(t))
    .filter((t) => t.length >= 4 && /\d/.test(t) && /[a-z]/.test(t));
}

/**
 * 5a. A recall that matches something you bought: by model number, or by the maker's name plus at least
 * two words of the product's name on the same receipt line. Conservative on purpose.
 */
export function recallMoves(recalls: ProductRecall[], receipts: ItemReceipt[]): Move[] {
  const out: Move[] = [];
  const seen = new Set<string>();
  for (const rc of recalls) {
    const brands = rc.manufacturers.map(norm).flatMap((m) => m.split(' ').filter((w) => w.length >= 3 && !STOP.has(w)).slice(0, 1));
    for (const r of receipts) {
      for (const line of r.items) {
        const name = norm(line.name);
        const flat = squash(line.name);
        const hit = rc.products.some((p) => {
          if (modelTokens(p.model).some((t) => flat.includes(t))) return true;
          const words = norm(p.name).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
          const shared = words.filter((w) => name.split(' ').includes(w)).length;
          return brands.some((b) => name.includes(b)) && shared >= 2;
        });
        const k = `recall:${rc.id}:${r.id}`;
        if (!hit || seen.has(k)) continue;
        seen.add(k);
        const refund = rc.remedies.some((x) => /refund/i.test(x));
        out.push({
          key: k,
          kind: 'recall',
          title: `Recall: something you bought at ${r.merchant} may be affected`,
          why: `${rc.title}. Your receipt${r.purchase_date ? ` from ${longDate(r.purchase_date)}` : ''}: “${line.name}”.`,
          steps: [
            'Check the model number on the recall page against yours, and stop using it if it matches.',
            rc.remedies.length ? `The maker offers: ${rc.remedies.join(', ').toLowerCase()}. Follow the recall page to claim it.` : 'Follow the recall page for what the maker offers.',
          ],
          amount: refund && line.price ? line.price : null,
          currency: r.currency,
          per: 'once',
          confirmLabel: refund ? 'Got my refund' : 'Got it sorted',
          url: rc.url,
          by: null,
        });
      }
    }
  }
  return out;
}

export const REBATE_FINDER = 'https://www.energystar.gov/rebate-finder';

/** Kinds of appliance ENERGY STAR certifies (and that rebates are commonly offered for). */
const ENERGY_STAR = /refrigerator|fridge|freezer|dishwasher|washer|washing machine|dryer|air conditioner|\bac unit\b|heat pump|water heater|dehumidifier|air purifier|thermostat/i;

/** 5b. A new appliance of a kind ENERGY STAR certifies: utilities and makers often pay rebates for efficient ones. */
export function rebateMoves(receipts: ItemReceipt[], now: Date): Move[] {
  return receipts
    .filter((r) => r.purchase_date && daysBetween(now, r.purchase_date) >= -120 && r.items.some((i) => ENERGY_STAR.test(i.name)))
    .map((r) => ({
      key: `rebate:${r.id}`,
      kind: 'rebate',
      title: `Your ${r.merchant} appliance may qualify for a rebate`,
      why: 'Utilities and manufacturers often pay rebates for ENERGY STAR certified appliances, usually within a set time after you buy.',
      steps: ['Look up your ZIP code and the model on ENERGY STAR’s rebate finder.', 'Keep the receipt: rebate forms ask for it.'],
      amount: null,
      currency: r.currency,
      per: 'once',
      confirmLabel: 'Got a rebate',
      url: REBATE_FINDER,
      by: null,
    }));
}

export interface MovesInput {
  userCards: Pick<UserCard, 'id' | 'card_id' | 'last_four' | 'open_date' | 'nickname'>[];
  cards: Pick<Card, 'id' | 'kind' | 'issuer' | 'product_name' | 'country' | 'currency' | 'annual_fee'>[];
  benefits: CardBenefit[];
  opportunities: Opportunity[];
  recovered: Recovered[];
  receipts: ItemReceipt[];
  recalls: ProductRecall[];
  /** Keys of savings already confirmed, and of moves you said aren't for you. */
  done: Set<string>;
}

/** Every money move for you now, soonest deadline first, then the biggest. */
export function moneyMoves(d: MovesInput, now: Date): Move[] {
  const covers = (kinds: string[]) => coversFor(kinds, d.userCards, d.cards, d.benefits);
  const all = [
    ...phoneInsuranceMoves(d.receipts, covers(['cell_phone']), now),
    ...rentalWaiverMoves(d.receipts, covers(['rental_car']), now),
    ...protectionPlanMoves(d.receipts, covers(['extended_warranty', 'purchase_protection']), now),
    ...tripInsuranceMoves(d.receipts, covers(['trip_cancellation', 'trip_delay', 'baggage', 'travel_insurance']), now),
    ...expiringPointsMoves(d.opportunities, now),
    ...feeDayMoves(d.userCards, d.cards, d.benefits, d.opportunities, d.recovered, now),
    ...recallMoves(d.recalls, d.receipts),
    ...rebateMoves(d.receipts, now),
  ];
  return all
    .filter((m) => !d.done.has(m.key))
    .sort((a, b) => (a.by ?? '9999').localeCompare(b.by ?? '9999') || (b.amount ?? 0) - (a.amount ?? 0));
}
