// "Your stores": the places you actually spend (email receipts, card alerts, bank purchases), and for each
// one everything you already have there that you might not know about: balances, codes, card offers, card
// credits, deals from the store's own pages, student prices, membership perks, the store's price-adjustment
// window on what you just bought, free programs you haven't joined, and the card that earns most there
// (with what paying with another card has cost you). Every item says where it came from.
// Nothing is invented: amounts are only ones a source states, and "ready to use" counts only money you hold.

import { checkoutStack, categoryFromPurchase, ISSUER_DOMAINS, type CheckoutInput, type SpendCategory } from './checkout';
import { isVague, matchStore, storeKey, type Deal, type DealFeedback } from './deals';
import { bestEarn, missedEarnings, type CardReward, type EarnRate } from './earn';
import { issuerMatches } from './forYou';
import { sameMerchant } from './merchant';
import { isMutedStore } from './mutes';
import type { Program } from './programs';
import { remainingValue } from './score';
import type { Receipt, StudentOffer } from './types';

/** Bills and plans aren't places you shop. */
const NOT_A_STORE = new Set(['phone_bill', 'subscription', 'service']);
const DAY = 86_400_000;
const dayOf = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);

export type StorePurchase = Pick<Receipt, 'merchant' | 'total' | 'currency' | 'purchase_date' | 'purchase_type' | 'matched_user_card_id'>;

export interface StoreSummary {
  key: string;
  /** The name as your latest purchase spelled it. */
  name: string;
  visits: number;
  /** Spent here, per currency (never added across currencies). */
  spend: Record<string, number>;
  /** The currency you mostly pay in here. */
  currency: string;
  last: string;
  category: SpendCategory;
  purchases: StorePurchase[];
}

const STATES = new Set('al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc'.split(' '));

/**
 * A card statement's name, cleaned: "SQ *BLUE BOTTLE", "TST* JOE'S PIZZA", "STARBUCKS #1234 MIAMI FL" and
 * "CHIPOTLE 0921" read as the store. Payment processors' prefixes, store numbers and a trailing state go.
 */
export function cleanStoreName(m: string): string {
  let s = m.trim().replace(/^(sq|tst|sp|pp|paypal|py|pos|dd|ic|in|debit|purchase|ach)\s*\*\s*/i, '');
  s = s.split(/\s#|\s\*|#\d/)[0]!;
  const words = s.split(/\s+/).filter((w) => w && !/\d/.test(w));
  while (words.length > 1 && STATES.has(words[words.length - 1]!.toLowerCase())) words.pop();
  const out = words.join(' ').trim() || m.trim();
  // ALL CAPS from a bank reads better as "Best Buy".
  return out === out.toUpperCase() ? out.toLowerCase().replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase()) : out;
}

/**
 * The stores you go to most in the last `days`: by visits, with big spends counting too (one $900 Best Buy
 * trip matters as much as a weekly coffee). The same purchase seen twice (an email receipt and the bank's
 * alert) counts once.
 */
export function topStores(receipts: StorePurchase[], now: Date, opts: { days?: number; max?: number } = {}): StoreSummary[] {
  const days = opts.days ?? 180;
  const since = now.getTime() - days * DAY;
  const kept = receipts.filter(
    (r) => r.total && r.total > 0 && r.purchase_date && dayOf(r.purchase_date) >= since && dayOf(r.purchase_date) <= now.getTime() + DAY && !(r.purchase_type && NOT_A_STORE.has(r.purchase_type)),
  );
  // One key per store: "chipotlemiami" joins "chipotle" (a city after the name), shortest first.
  const raw = new Map(kept.map((r) => [r, storeKey(cleanStoreName(r.merchant))]));
  const roots: string[] = [];
  for (const k of [...new Set(raw.values())].sort((a, b) => a.length - b.length)) {
    if (k.length >= 3 && !roots.some((x) => x.length >= 4 && k.startsWith(x))) roots.push(k);
  }
  const rootOf = (k: string) => roots.find((x) => k === x || (x.length >= 4 && k.startsWith(x))) ?? k;
  const names = new Map<string, string>();
  const groups = new Map<string, StorePurchase[]>();
  for (const r of kept) {
    const own = raw.get(r)!;
    const key = rootOf(own);
    if (key.length < 3) continue;
    // The name of the purchase whose own key is the store's (the plain "Chipotle", not "Chipotle Miami").
    if (own === key && !names.has(key)) names.set(key, cleanStoreName(r.merchant));
    const list = groups.get(key) ?? [];
    // Same store, same amount and currency within 3 days: one purchase seen twice.
    const twin = list.find((x) => x.currency === r.currency && Math.abs(x.total! - r.total!) <= 0.01 && Math.abs(dayOf(x.purchase_date!) - dayOf(r.purchase_date!)) <= 3 * DAY);
    if (twin) {
      // Keep the one that knows which card paid.
      if (!twin.matched_user_card_id && r.matched_user_card_id) list[list.indexOf(twin)] = r;
      continue;
    }
    list.push(r);
    groups.set(key, list);
  }
  const out: (StoreSummary & { score: number })[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => b.purchase_date!.localeCompare(a.purchase_date!));
    const spend: Record<string, number> = {};
    const count: Record<string, number> = {};
    for (const r of list) {
      spend[r.currency] = Math.round(((spend[r.currency] ?? 0) + r.total!) * 100) / 100;
      count[r.currency] = (count[r.currency] ?? 0) + 1;
    }
    const currency = Object.entries(count).sort((a, b) => b[1] - a[1])[0]![0];
    const latest = list[0]!;
    const typed = list.find((r) => r.purchase_type)?.purchase_type ?? null;
    out.push({
      key,
      name: names.get(key) ?? cleanStoreName(latest.merchant),
      visits: list.length,
      spend,
      currency,
      last: latest.purchase_date!.slice(0, 10),
      category: categoryFromPurchase(latest.merchant, typed),
      purchases: list,
      // Visits, plus up to 10 for spend (every 25 in the store's main currency).
      score: list.length + Math.min((spend[currency] ?? 0) / 25, 10),
    });
  }
  out.sort((a, b) => b.score - a.score || b.last.localeCompare(a.last));
  return out.slice(0, opts.max ?? 8).map(({ score: _score, ...s }) => s);
}

export type StoreItemKind =
  | 'balance' | 'card_credit' | 'code' | 'card_offer' | 'deal' | 'student' | 'membership' | 'price_adjust' | 'program' | 'best_card';

export interface StoreItem {
  /** Stable within the store, for "This is wrong". */
  key: string;
  kind: StoreItemKind;
  title: string;
  detail: string | null;
  /** A stated amount (a balance, a code's value, a credit left, a deal's dollars off); never a guess. */
  amount: number | null;
  percent: number | null;
  currency: string | null;
  /** Counted in "ready to use": money you hold here (balances, credits left, the best code, card offers). */
  ready: boolean;
  /** Where PerkScan got it, in plain words. */
  source: string;
  url: string | null;
  expires: string | null;
  opportunityId?: string;
  /** A catalog id (benefit, program, deal, student offer), not personal. */
  catalogRef?: string;
}

export interface StoreFinds {
  store: StoreSummary;
  items: StoreItem[];
  /** Money you hold here, per currency. */
  ready: Record<string, number>;
  /** What the right card would have earned on your purchases here, more than the card you used (cash values the issuers state; USD). */
  missed: { total: number; count: number; bestLabel: string } | null;
}

export interface StoresInput extends Omit<CheckoutInput, 'feedback' | 'programs'> {
  programs: Program[];
  feedback: Map<string, 'have' | 'dismissed'>;
  studentOffers: Pick<StudentOffer, 'id' | 'provider' | 'name' | 'summary' | 'url'>[];
  deals: Deal[];
  dealFeedback: Pick<DealFeedback, 'deal_id' | 'action'>[];
  earnRates: EarnRate[];
  cardRewards: CardReward[];
  /** Stores you hid: their offers and deals aren't shown here either. */
  mutes: string[];
  /** "store_item:<store>:<item>" keys you said are wrong. */
  wrong: Set<string>;
  country: string | null;
  cardLabel: (userCardId: string) => string;
  /** Short date for copy, injected so this stays free of UI code. */
  date: (iso: string) => string;
}

const ORDER: StoreItemKind[] = ['balance', 'card_credit', 'code', 'card_offer', 'deal', 'student', 'membership', 'price_adjust', 'program', 'best_card'];
const live = (ends: string | null, today: string) => !ends || ends.slice(0, 10) >= today;
const inCountry = (countries: string[], country: string | null) => !countries.length || !country || countries.includes(country);
const fromEmail = (domain: string | null | undefined) => (domain ? `Your email from ${domain}` : 'Added by you');

/** Everything you have at one store, in the order to use it. */
export function storeFinds(summary: StoreSummary, d: StoresInput): StoreFinds {
  // The catalog spells big stores properly ("McDonald's", not "Mcdonald's" from a bank's capitals).
  const known = d.programs.find((p) => storeKey(p.provider) === summary.key)?.provider ?? d.deals.find((x) => storeKey(x.merchant) === summary.key)?.merchant;
  const store = known ? { ...summary, name: known } : summary;
  const today = d.now.toISOString().slice(0, 10);
  const muted = isMutedStore(store.key, d.mutes);
  const stack = checkoutStack(store.name, store.category, { ...d, feedback: d.feedback });
  const items: StoreItem[] = [];
  const base = { detail: null, amount: null, percent: null, currency: null, ready: false, url: null, expires: null } as const;

  // Gift cards, store credit and travel credit you hold here.
  for (const o of stack.storeCredit) {
    items.push({ ...base, key: `opp:${o.id}`, kind: 'balance', title: o.title, detail: o.code ? `Code ${o.code}` : null, amount: o.value_estimate, currency: o.currency, ready: !!o.value_estimate, source: fromEmail(o.sender_domain), expires: o.expires_at, opportunityId: o.id });
  }

  // Card credits that apply here and still have money left this period.
  for (const o of d.opportunities) {
    if (o.type !== 'card_credit' || o.status !== 'open' || !o.benefit_id || !o.user_card_id) continue;
    if (o.expires_at && new Date(o.expires_at) <= d.now) continue;
    const b = d.benefits.find((x) => x.id === o.benefit_id);
    if (!b?.merchant_match?.merchants.some((m) => sameMerchant(m, store.name))) continue;
    const left = o.value_estimate === null ? null : remainingValue(o, d.recoveredByOpp);
    if (left !== null && left <= 0) continue;
    items.push({
      ...base,
      key: `credit:${o.id}`,
      kind: 'card_credit',
      title: `${b.name} on your ${d.cardLabel(o.user_card_id)}`,
      detail: left === null ? 'Amount not verified: check your card’s terms' : `${d.money(left, o.currency)} left this period. Pay with that card here.`,
      amount: left,
      currency: o.currency,
      ready: left !== null,
      source: 'Your card’s terms',
      expires: o.expires_at,
      opportunityId: o.id,
      catalogRef: b.id,
    });
  }

  if (!muted) {
    // Codes from the store's emails: the best one counts (codes rarely combine).
    const cardOffers = stack.promos.filter((o) => o.sender_domain && ISSUER_DOMAINS.test(o.sender_domain));
    const codes = stack.promos.filter((o) => !cardOffers.includes(o));
    const best = [...codes].sort((a, b) => (b.value_estimate ?? 0) - (a.value_estimate ?? 0) || (b.percent_off ?? 0) - (a.percent_off ?? 0))[0];
    for (const o of codes) {
      items.push({
        ...base,
        key: `opp:${o.id}`,
        kind: 'code',
        title: o.title,
        detail: [o.code ? `Code ${o.code}` : null, o === best && codes.length > 1 ? `Best of ${codes.length} (codes rarely combine)` : null].filter(Boolean).join(' · ') || null,
        amount: o.value_estimate,
        percent: o.percent_off ?? null,
        currency: o.currency,
        ready: o === best && !!o.value_estimate,
        source: fromEmail(o.sender_domain),
        expires: o.expires_at,
        opportunityId: o.id,
      });
    }
    // Offers your card company emailed for this store: activate, then pay with that card.
    for (const o of cardOffers) {
      items.push({ ...base, key: `opp:${o.id}`, kind: 'card_offer', title: o.title, detail: 'Activate it in your bank’s app first, then pay with that card.', amount: o.value_estimate, percent: o.percent_off ?? null, currency: o.currency, ready: !!o.value_estimate, source: fromEmail(o.sender_domain), expires: o.expires_at, opportunityId: o.id });
    }
    // Deals from the store's own pages (the scout reads them), still running, not hidden.
    const hidden = new Set(d.dealFeedback.filter((f) => f.action !== 'saved').map((f) => f.deal_id));
    for (const deal of d.deals) {
      if (hidden.has(deal.id) || !live(deal.ends_on, today) || (deal.starts_on && deal.starts_on.slice(0, 10) > today)) continue;
      if (!inCountry(deal.countries, d.country) || isVague(deal) || !matchStore(deal, [store.key])) continue;
      items.push({
        ...base,
        key: `deal:${deal.id}`,
        kind: 'deal',
        title: deal.title,
        detail: [deal.code ? `Code ${deal.code}` : null, deal.min_spend ? `On ${d.money(deal.min_spend, deal.currency ?? store.currency)} or more` : null, deal.summary].filter(Boolean).join(' · ') || null,
        amount: deal.amount,
        percent: deal.percent_off,
        currency: deal.currency,
        source: deal.source === 'official' ? `${deal.merchant}’s own website` : deal.source === 'shared' ? 'Seen by other PerkScan users' : `${deal.merchant} (partner page)`,
        url: deal.url,
        expires: deal.ends_on,
        catalogRef: deal.id,
      });
    }
  }

  // Student prices here.
  for (const s of d.studentOffers.filter((x) => sameMerchant(x.provider, store.name)).slice(0, 2)) {
    items.push({ ...base, key: `student:${s.id}`, kind: 'student', title: s.name, detail: s.summary, source: `${s.provider}’s student page`, url: s.url, catalogRef: s.id });
  }

  // Your memberships that work here.
  for (const m of stack.memberships) {
    items.push({ ...base, key: `member:${m.userCardId}`, kind: 'membership', title: `${m.name} works here`, detail: m.perks.map((p) => p.name).slice(0, 3).join(' · '), source: `Your ${m.name} membership terms` });
  }

  // The store's own price-adjustment policy, on what you bought here inside its window.
  for (const p of d.programs) {
    if (p.kind !== 'price_adjust' || p.status !== 'active' || !matchStore({ merchant: p.provider, merchant_keys: p.merchants.map(storeKey) }, [store.key])) continue;
    if (!inCountry(p.countries, d.country)) continue;
    const window = p.window_days;
    const recent = window
      ? store.purchases.filter((r) => r.purchase_date && dayOf(r.purchase_date) + window * DAY >= dayOf(today))
      : [];
    const last = recent[0];
    items.push({
      ...base,
      key: `program:${p.id}`,
      kind: 'price_adjust',
      title: last
        ? `Bought here ${d.date(last.purchase_date!)}: if the price drops by ${d.date(new Date(dayOf(last.purchase_date!) + window! * DAY).toISOString())}, ask for the difference`
        : p.name,
      detail: p.summary,
      source: `${p.provider}’s own policy`,
      url: p.url,
      expires: last ? new Date(dayOf(last.purchase_date!) + window! * DAY).toISOString().slice(0, 10) : null,
      catalogRef: p.id,
    });
  }

  // Free programs here you haven't joined.
  for (const p of stack.programs.filter((x) => !x.have)) {
    items.push({ ...base, key: `program:${p.id}`, kind: 'program', title: `Free: ${p.name}`, detail: p.summary, source: 'The program’s own website', url: p.url, catalogRef: p.id });
  }

  // The card to pay with here, and what using another one has cost you.
  const earnData = { userCards: d.userCards, cards: d.cards, rates: d.earnRates, rewards: d.cardRewards };
  const earn = bestEarn(store.name, store.category, earnData);
  let missed: StoreFinds['missed'] = null;
  if (earn.best) {
    const since = new Date(d.now.getTime() - 180 * DAY).toISOString().slice(0, 10);
    const m = missedEarnings(store.purchases, earnData, categoryFromPurchase, since);
    const label = d.cardLabel(earn.best.userCardId);
    if (m.total > 0) missed = { total: m.total, count: m.count, bestLabel: label };
    items.push({
      ...base,
      key: `pay:${earn.best.rate.card_id}`,
      kind: 'best_card',
      title: `Pay with your ${label}: ${earn.best.label}`,
      detail: m.total > 0
        ? `On ${m.count === 1 ? 'one purchase' : `${m.count} purchases`} here with another card, it would have earned ${d.money(m.total, 'USD')} more.`
        : earn.best.valueLabel,
      source: 'Your card issuers’ earn rates',
    });
  }

  const shown = items
    .filter((i) => !d.wrong.has(`store_item:${store.key}:${i.key}`))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const ready: Record<string, number> = {};
  for (const i of shown) if (i.ready && i.amount && i.currency) ready[i.currency] = Math.round(((ready[i.currency] ?? 0) + i.amount) * 100) / 100;
  return { store, items: shown, ready, missed };
}

/** Card-app offer programs (Amex Offers, BankAmeriDeals…) for the cards you hold: worth a look before each of these stores. */
export function cardAppOffers(
  programs: Pick<Program, 'id' | 'kind' | 'name' | 'provider' | 'summary' | 'url' | 'merchants' | 'issuers' | 'status'>[],
  issuers: string[],
): Pick<Program, 'id' | 'name' | 'provider' | 'summary' | 'url'>[] {
  return programs.filter(
    (p) => p.status === 'active' && p.kind === 'free_perk' && !p.merchants.length && p.issuers.length && /offers|deals/i.test(p.name) && p.issuers.some((x) => issuers.some((i) => issuerMatches(x, i))),
  );
}

export interface YourStores {
  stores: StoreFinds[];
  /** Money you hold at these stores, per currency. */
  ready: Record<string, number>;
  /** What the right card would have earned at these stores in 6 months, more than the cards you used (USD). */
  missed: number;
  /** How many things you have across them. */
  things: number;
}

export function yourStores(receipts: StorePurchase[], d: StoresInput, max = 8): YourStores {
  const stores = topStores(receipts, d.now, { max }).map((s) => storeFinds(s, d));
  const ready: Record<string, number> = {};
  let missed = 0;
  let things = 0;
  for (const s of stores) {
    for (const [cur, n] of Object.entries(s.ready)) ready[cur] = Math.round(((ready[cur] ?? 0) + n) * 100) / 100;
    missed = Math.round((missed + (s.missed?.total ?? 0)) * 100) / 100;
    things += s.items.filter((i) => i.kind !== 'best_card').length;
  }
  return { stores, ready, missed, things };
}
