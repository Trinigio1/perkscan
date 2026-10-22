import seedJson from '../../../seed/card_benefits.json';
import { groupPerks, loungeCards, perkGroup } from '../perks';
import type { CardBenefit } from '../types';

const benefit = (id: string, type: CardBenefit['type'] = 'perk', status: CardBenefit['status'] = 'active'): CardBenefit => ({
  id,
  card_id: id.split('__')[0]!,
  type,
  name: id.split('__')[1]!,
  amount: null,
  period: 'per_claim',
  period_anchor: 'calendar',
  amount_schedule: null,
  terms_summary: null,
  max_coverage: null,
  coverage_window_days: null,
  enrollment_required: false,
  merchant_match: null,
  currency: null,
  status,
  source_url: null,
  last_verified: null,
  notes: null,
  sort_order: 0,
});

describe('perkGroup', () => {
  it.each([
    ['amex_platinum__lounges', 'airport'],
    ['amex_platinum__global_entry', 'airport'],
    ['chase_sapphire_reserve__trip_delay', 'travel'],
    ['first_citizens_tt_visa_signature__baggage', 'travel'],
    ['scotiabank_tt_aero_platinum_visa__travel_medical', 'travel'],
    ['amex_platinum__hotel_status', 'status'],
    ['republic_tt_visa_signature__concierge', 'status'],
    ['scotiabank_tt_aero_platinum_visa__scotiapoints', 'rewards'],
    ['republic_tt_pricesmart_visa_platinum__cash_back', 'rewards'],
    ['first_citizens_tt_visa_classic__price_protection', 'shopping'],
    ['amex_platinum__cell_phone', 'shopping'],
    ['scotiabank_tt_visa_classic__fee_waiver', 'card'],
  ])('%s → %s', (id, group) => expect(perkGroup({ id, type: 'perk' })).toBe(group));

  it('puts every perk in the catalog somewhere sensible', () => {
    const cardServices = new Set(['fee_waiver', 'additional_cards', 'emergency_card_replacement']);
    for (const card of seedJson.cards) {
      for (const b of card.benefits.filter((x) => x.type !== 'credit')) {
        const key = b.id.split('__')[1]!;
        if (perkGroup({ id: b.id, type: b.type as CardBenefit['type'] }) === 'card') expect(cardServices).toContain(key);
      }
    }
  });
});

describe('groupPerks', () => {
  const label = (id: string) => ({ u1: 'Amex Platinum ·· 1001', u2: 'Scotiabank Visa ·· 7290', u3: 'Amex Platinum ·· 2002' })[id] ?? id;
  const benefits = [
    benefit('amex_platinum__uber_cash', 'credit'),
    benefit('amex_platinum__lounges'),
    benefit('amex_platinum__purchase_protection', 'protection', 'TODO_VERIFY'),
    benefit('scotiabank_tt_visa_classic__fee_waiver'),
    benefit('other_card__lounges'),
  ];

  it('leaves credits out, skips cards you don’t have, and groups the rest in order', () => {
    const groups = groupPerks(
      [{ id: 'u1', card_id: 'amex_platinum' }, { id: 'u2', card_id: 'scotiabank_tt_visa_classic' }],
      benefits,
      label,
    );
    expect(groups.map((g) => [g.group, g.lines.map((l) => l.benefit.id)])).toEqual([
      ['airport', ['amex_platinum__lounges']],
      ['shopping', ['amex_platinum__purchase_protection']],
      ['card', ['scotiabank_tt_visa_classic__fee_waiver']],
    ]);
  });

  it('lists a perk once when you hold two of the same card', () => {
    const groups = groupPerks([{ id: 'u1', card_id: 'amex_platinum' }, { id: 'u3', card_id: 'amex_platinum' }], benefits, label);
    expect(groups[0]!.lines[0]!.cards).toEqual(['Amex Platinum ·· 1001', 'Amex Platinum ·· 2002']);
    expect(loungeCards(groups)).toEqual(['Amex Platinum ·· 1001', 'Amex Platinum ·· 2002']);
  });

  it('is empty without cards', () => {
    expect(groupPerks([], benefits, label)).toEqual([]);
  });
});
