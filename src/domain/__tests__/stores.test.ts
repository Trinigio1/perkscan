import { opp } from '../__fixtures__/opportunities';
import type { Deal } from '../deals';
import type { CardReward, EarnRate } from '../earn';
import type { Program } from '../programs';
import { cardAppOffers, cleanStoreName, storeFinds, topStores, yourStores, type StorePurchase, type StoresInput } from '../stores';
import type { Card, CardBenefit, UserCard } from '../types';

const NOW = new Date('2026-11-03T12:00:00Z');
const card = (id: string, issuer = 'Bank'): Card => ({
  id, kind: 'card', issuer, product_name: id, country: 'US', currency: 'USD', annual_fee: null, status: 'active', source_url: null, last_verified: null, sort_order: 0,
});
const benefit = (b: Partial<CardBenefit> & Pick<CardBenefit, 'id' | 'card_id' | 'type'>): CardBenefit => ({
  name: b.id, amount: null, period: 'monthly', period_anchor: 'calendar', amount_schedule: null, terms_summary: null, max_coverage: null,
  coverage_window_days: null, enrollment_required: false, merchant_match: null, currency: null, status: 'active', source_url: null,
  last_verified: null, notes: null, sort_order: 0, ...b,
});
const uc = (id: string, card_id: string): UserCard => ({ id, user_id: 'u1', card_id, last_four: '1111', open_date: null, nickname: null, created_at: '' });
const buy = (merchant: string, total: number, date: string, extra: Partial<StorePurchase> = {}): StorePurchase => ({
  merchant, total, currency: 'USD', purchase_date: date, purchase_type: null, matched_user_card_id: null, ...extra,
});
const program = (p: Partial<Program> & Pick<Program, 'id' | 'kind' | 'name' | 'provider'>): Program => ({
  countries: ['US'], summary: `${p.name} summary`, how_to: '', url: `https://example.com/${p.id}`, merchants: [], window_days: null, interests: [], issuers: [],
  student_only: false, status: 'active', last_verified: '2026-11-01', sort_order: 0, ...p,
});
const deal = (d: Partial<Deal> & Pick<Deal, 'id' | 'merchant' | 'title'>): Deal => ({
  source: 'official', merchant_keys: [], summary: null, category: 'shopping', amount: null, percent_off: null, currency: 'USD', code: null, min_spend: null,
  countries: ['US'], regions: [], starts_on: null, ends_on: '2026-11-30', url: 'https://target.com/deals', evidence: 'x', confidence: 'confirmed', seen_by: 0, saves: 0, ...d,
});

const cards = [card('gold', 'American Express'), card('bofa', 'Bank of America')];
const userCards = [uc('uc-gold', 'gold'), uc('uc-bofa', 'bofa')];
const rates: EarnRate[] = [
  { card_id: 'gold', category: 'dining', rate: 4, merchants: [], cap: null, cap_period: null, needs: null, note: null, source_url: 'x' },
  { card_id: 'gold', category: 'everything', rate: 1, merchants: [], cap: null, cap_period: null, needs: null, note: null, source_url: 'x' },
  { card_id: 'bofa', category: 'everything', rate: 1.5, merchants: [], cap: null, cap_period: null, needs: null, note: null, source_url: 'x' },
];
const rewards: CardReward[] = [
  { card_id: 'gold', kind: 'points', cents_per_unit: 1, value_basis: 'statement credit' },
  { card_id: 'bofa', kind: 'points', cents_per_unit: 1, value_basis: 'statement credit' },
];
const input = (over: Partial<StoresInput> = {}): StoresInput => ({
  cards, userCards, benefits: [], opportunities: [], receipts: [], recoveredByOpp: new Map(), now: NOW,
  money: (n, c) => `${c} ${n}`, programs: [], feedback: new Map(), studentOffers: [], deals: [], dealFeedback: [], earnRates: rates, cardRewards: rewards,
  mutes: [], wrong: new Set(), country: 'US', cardLabel: (id) => (id === 'uc-gold' ? 'Amex Gold' : 'BofA ··6042'), date: (iso) => iso.slice(0, 10), ...over,
});

describe('cleanStoreName', () => {
  it('reads card statement names as the store', () => {
    expect(cleanStoreName('SQ *BLUE BOTTLE COFFEE')).toBe('Blue Bottle Coffee');
    expect(cleanStoreName("TST* JOE'S PIZZA 123")).toBe("Joe's Pizza");
    expect(cleanStoreName('STARBUCKS #1234 MIAMI FL')).toBe('Starbucks');
    expect(cleanStoreName('CHIPOTLE 0921 CORAL GABLES FL')).toBe('Chipotle Coral Gables');
    expect(cleanStoreName('AMAZON MKTPL*AB12CD')).toBe('Amazon');
    expect(cleanStoreName('Trader Joe’s')).toBe('Trader Joe’s');
  });
});

describe('topStores', () => {
  it('joins a store’s branches under its plain name', () => {
    const s = topStores([buy('Chipotle', 12, '2026-10-01'), buy('CHIPOTLE 0921 CORAL GABLES FL', 11, '2026-10-12'), buy('Target.com', 30, '2026-10-02'), buy('TARGET T-1234', 20, '2026-10-20')], NOW);
    expect(s.map((x) => [x.name, x.visits]).sort()).toEqual([['Chipotle', 2], ['Target', 2]]);
  });


  it('ranks by visits, with big spends counting, and counts a purchase seen twice once', () => {
    const s = topStores([
      buy('Starbucks', 6, '2026-10-30'), buy('STARBUCKS #123', 6, '2026-10-20'), buy('Starbucks', 7, '2026-10-10'),
      buy('Best Buy', 900, '2026-09-01'),
      buy('Chipotle', 12, '2026-10-01'),
      // The bank's alert of the same Chipotle meal: counted once, and keeps the card it knows.
      buy('CHIPOTLE 1234', 12, '2026-10-02', { matched_user_card_id: 'uc-bofa' }),
    ], NOW);
    expect(s.map((x) => [x.name, x.visits])).toEqual([['Best Buy', 1], ['Starbucks', 3], ['Chipotle', 1]]);
    expect(s[2]!.purchases[0]!.matched_user_card_id).toBe('uc-bofa');
    expect(s[1]!.spend).toEqual({ USD: 19 });
  });

  it('leaves out bills, refunds, old purchases and keeps currencies apart', () => {
    const s = topStores([
      buy('T-Mobile', 70, '2026-10-01', { purchase_type: 'phone_bill' }),
      buy('Netflix', 15, '2026-10-01', { purchase_type: 'subscription' }),
      buy('Target', -20, '2026-10-01'),
      buy('Target', 30, '2025-01-01'),
      buy('Massy Stores', 200, '2026-10-01', { currency: 'TTD' }),
      buy('Massy Stores', 10, '2026-10-05'),
      buy('Massy Stores', 150, '2026-10-09', { currency: 'TTD' }),
    ], NOW);
    expect(s.map((x) => x.name)).toEqual(['Massy Stores']);
    expect(s[0]!.spend).toEqual({ TTD: 350, USD: 10 });
    expect(s[0]!.currency).toBe('TTD');
  });
});

describe('storeFinds', () => {
  const target = topStores([buy('Target', 40, '2026-10-30', { matched_user_card_id: 'uc-gold' }), buy('Target', 60, '2026-10-01', { matched_user_card_id: 'uc-gold' })], NOW)[0]!;

  it('lists everything you have at a store, in the order to use it, with where each came from', () => {
    const gift = opp({ id: 'g1', type: 'gift_card', category: 'store_credit_gift_cards', merchant: 'Target', title: 'Target GiftCard', value_estimate: 25, sender_domain: 'target.com', user_card_id: null, benefit_id: null });
    const code10 = opp({ id: 'p1', type: 'promo', category: 'promos', merchant: null, sender_domain: 'em.target.com', title: '$10 off $50', value_estimate: 10, code: 'SAVE10', user_card_id: null, benefit_id: null });
    const code5 = opp({ id: 'p2', type: 'promo', category: 'promos', merchant: 'Target', sender_domain: 'target.com', title: '$5 off', value_estimate: 5, user_card_id: null, benefit_id: null });
    const amexOffer = opp({ id: 'p3', type: 'promo', category: 'promos', merchant: 'Target', sender_domain: 'americanexpress.com', title: 'Spend $50, get $10 back', value_estimate: 10, user_card_id: null, benefit_id: null });
    const f = storeFinds(target, input({
      opportunities: [gift, code10, code5, amexOffer],
      deals: [
        deal({ id: 'd1', merchant: 'Target', title: '20% off home goods', percent_off: 20 }),
        deal({ id: 'd2', merchant: 'Target', title: 'Old deal', ends_on: '2026-10-01', amount: 5 }),
      ],
      programs: [
        program({ id: 'target_circle', kind: 'free_perk', name: 'Target Circle', provider: 'Target', merchants: ['target'] }),
        program({ id: 'target_price_match', kind: 'price_adjust', name: 'Target price match', provider: 'Target', merchants: ['target'], window_days: 14 }),
      ],
    }));
    expect(f.items.map((i) => i.kind)).toEqual(['balance', 'code', 'code', 'card_offer', 'deal', 'price_adjust', 'program', 'best_card']);
    // A promo emailed from the store's domain counts here even when the email didn't name the store.
    expect(f.items.find((i) => i.key === 'opp:p1')).toMatchObject({ ready: true, detail: 'Code SAVE10 · Best of 2 (codes rarely combine)', source: 'Your email from em.target.com' });
    // Only the best code counts: 25 gift card + 10 code + 10 card offer.
    expect(f.ready).toEqual({ USD: 45 });
    expect(f.items.find((i) => i.kind === 'deal')).toMatchObject({ title: '20% off home goods', source: 'Target’s own website', ready: false, catalogRef: 'd1' });
    // Bought 4 days ago, inside Target's 14-day window.
    expect(f.items.find((i) => i.kind === 'price_adjust')?.title).toBe('Bought here 2026-10-30: if the price drops by 2026-11-13, ask for the difference');
    expect(f.items.find((i) => i.kind === 'program')).toMatchObject({ title: 'Free: Target Circle', catalogRef: 'target_circle' });
  });

  it('shows the card that earns most and what using another one cost you here, from stated values only', () => {
    const f = storeFinds(target, input());
    // 1.5% vs 1% on $100 = $0.50.
    expect(f.missed).toEqual({ total: 0.5, count: 2, bestLabel: 'BofA ··6042' });
    expect(f.items.at(-1)).toMatchObject({ kind: 'best_card', title: 'Pay with your BofA ··6042: 1.5x points', detail: 'On 2 purchases here with another card, it would have earned USD 0.5 more.' });
  });

  it('adds card credits that apply here, with what is left', () => {
    const uber = topStores([buy('Uber Eats', 30, '2026-10-30')], NOW)[0]!;
    const credit = opp({ id: 'c1', user_card_id: 'uc-gold', benefit_id: 'gold__uber_cash', value_estimate: 10, expires_at: '2026-12-01T00:00:00Z' });
    const f = storeFinds(uber, input({
      benefits: [benefit({ id: 'gold__uber_cash', card_id: 'gold', type: 'credit', name: 'Uber Cash', merchant_match: { merchants: ['uber eats', 'uber'] } })],
      opportunities: [credit],
      recoveredByOpp: new Map([['c1', 4]]),
    }));
    expect(f.items[0]).toMatchObject({ kind: 'card_credit', title: 'Uber Cash on your Amex Gold', amount: 6, ready: true, catalogRef: 'gold__uber_cash' });
    expect(f.ready).toEqual({ USD: 6 });
  });

  it('hides what you said is wrong, and a hidden store’s offers', () => {
    const gift = opp({ id: 'g1', type: 'gift_card', category: 'store_credit_gift_cards', merchant: 'Target', title: 'Gift card', value_estimate: 25, user_card_id: null, benefit_id: null });
    const code = opp({ id: 'p1', type: 'promo', category: 'promos', merchant: 'Target', title: '$10 off', value_estimate: 10, user_card_id: null, benefit_id: null });
    const f = storeFinds(target, input({ opportunities: [gift, code], wrong: new Set(['store_item:target:opp:g1']), mutes: ['target'] }));
    expect(f.items.map((i) => i.kind)).toEqual(['best_card']);
    expect(f.ready).toEqual({});
  });

  it('spells the store the way the catalog does', () => {
    const mc = topStores([buy("MCDONALD'S F1234", 9.4, '2026-10-28')], NOW)[0]!;
    expect(mc.name).toBe("Mcdonald's");
    const f = storeFinds(mc, input({ programs: [program({ id: 'mymcd', kind: 'free_perk', name: "MyMcDonald's Rewards", provider: "McDonald's", merchants: ["mcdonald's", 'mcdonalds'] })] }));
    expect(f.store.name).toBe("McDonald's");
    expect(f.items[0]).toMatchObject({ kind: 'program', title: "Free: MyMcDonald's Rewards" });
  });

  it('price policy without a recent purchase in its window is just the policy', () => {
    const old = topStores([buy('Target', 40, '2026-09-01')], NOW)[0]!;
    const f = storeFinds(old, input({ programs: [program({ id: 'tpm', kind: 'price_adjust', name: 'Target price match', provider: 'Target', merchants: ['target'], window_days: 14 })] }));
    expect(f.items[0]).toMatchObject({ kind: 'price_adjust', title: 'Target price match', expires: null });
  });
});

describe('yourStores and card apps', () => {
  it('adds up money you hold and the earnings you missed', () => {
    const y = yourStores([buy('Target', 100, '2026-10-30', { matched_user_card_id: 'uc-gold' })], input({
      opportunities: [opp({ id: 'g1', type: 'gift_card', category: 'store_credit_gift_cards', merchant: 'Target', title: 'Gift card', value_estimate: 25, user_card_id: null, benefit_id: null })],
    }));
    expect(y.ready).toEqual({ USD: 25 });
    expect(y.missed).toBe(0.5);
    expect(y.things).toBe(1);
  });

  it('names the card-app offer programs for the cards you hold', () => {
    const ps = [
      program({ id: 'amex_offers', kind: 'free_perk', name: 'Amex Offers', provider: 'American Express', issuers: ['American Express'] }),
      program({ id: 'chase_offers', kind: 'free_perk', name: 'Chase Offers', provider: 'Chase', issuers: ['Chase'] }),
      program({ id: 'bofa_museums_on_us', kind: 'free_perk', name: 'Museums on Us', provider: 'Bank of America', issuers: ['Bank of America'] }),
    ];
    expect(cardAppOffers(ps, ['American Express', 'Bank of America']).map((p) => p.id)).toEqual(['amex_offers']);
  });
});
