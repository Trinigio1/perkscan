import { zeroReasons } from '../zeroReasons';
import { opp } from '../__fixtures__/opportunities';
import type { Card, CardBenefit, UserCard } from '../types';

const card = (id: string, product_name: string): Card => ({
  id, issuer: 'Bank', product_name, country: 'TT', currency: 'TTD', annual_fee: null, status: 'TODO_VERIFY', source_url: null, last_verified: null, sort_order: 0,
});
const benefit = (id: string, card_id: string, type: CardBenefit['type'], amount: number | null = null): CardBenefit => ({
  id, card_id, type, name: id, amount, period: 'monthly', period_anchor: 'calendar', amount_schedule: null, terms_summary: null, max_coverage: null,
  coverage_window_days: null, enrollment_required: false, merchant_match: null, currency: null, status: 'TODO_VERIFY', source_url: null,
  last_verified: null, notes: null, sort_order: 0,
});
const uc = (card_id: string): UserCard => ({ id: `uc-${card_id}`, user_id: 'u', card_id, last_four: '1111', open_date: null, nickname: null, created_at: '' });

const cards = [card('scotia', 'Scotiabank Visa Classic'), card('gold', 'American Express® Gold Card')];
const benefits = [benefit('scotia__price_protection', 'scotia', 'protection'), benefit('gold__uber_cash', 'gold', 'credit'), benefit('gold__dining', 'gold', 'credit')];

describe('zeroReasons', () => {
  it('explains a card with no credits, and an empty inbox', () => {
    const r = zeroReasons({ cards, benefits, userCards: [uc('scotia')], opportunities: [], readyToUse: null });
    expect(r.map((x) => x.id)).toEqual(['no_credits', 'no_offers']);
    expect(r[0]!.text).toMatch(/^Scotiabank Visa Classic has no statement credits/);
  });

  it('counts unverified credits, valueless offers, and what is still usable', () => {
    const r = zeroReasons({
      cards, benefits, userCards: [uc('gold')],
      opportunities: [opp({ type: 'promo', category: 'promos', value_estimate: null }), opp({ type: 'promo', category: 'promos', value_estimate: 10 })],
      readyToUse: 'TT$50',
    });
    expect(r.map((x) => x.id)).toEqual(['unverified_credits', 'no_value_offers', 'nothing_expired']);
    expect(r[0]!.text).toContain('2 credits');
    expect(r[1]!.text).toContain('1 offer you have doesn’t');
    expect(r[2]!.text).toMatch(/^TT\$50 is still yours/);
  });

  it('asks for cards first when there are none', () => {
    expect(zeroReasons({ cards, benefits, userCards: [], opportunities: [], readyToUse: null })[0]).toMatchObject({ id: 'no_cards', action: { route: '/add-card' } });
  });
});
