import { MAX_REMINDERS, planCreditReminders } from '../reminders';
import { opp, rec } from '../__fixtures__/opportunities';

const NOW = new Date(2026, 9, 1, 9, 0, 0); // Oct 1 2026, 09:00 local

describe('planCreditReminders', () => {
  it('schedules 7-day and 2-day reminders at 10:00 local', () => {
    const o = opp({ title: 'Uber Cash', value_estimate: 15, expires_at: new Date(2026, 10, 1).toISOString() });
    const r = planCreditReminders([o], [], NOW);
    expect(r.map((x) => x.id)).toEqual([`remind-${o.id}-7d`, `remind-${o.id}-2d`]);
    expect(r[0]!.fireAt).toEqual(new Date(2026, 9, 25, 10, 0, 0));
    expect(r[1]!.fireAt).toEqual(new Date(2026, 9, 30, 10, 0, 0));
    expect(r[0]!.body).toContain('$15');
  });

  it('skips reminders already in the past', () => {
    const o = opp({ expires_at: new Date(2026, 9, 4).toISOString() });
    const r = planCreditReminders([o], [], NOW);
    expect(r.map((x) => x.id)).toEqual([`remind-${o.id}-2d`]);
  });

  it('skips fully used, claimed and dismissed items', () => {
    const used = opp({ value_estimate: 10, expires_at: new Date(2026, 10, 1).toISOString() });
    const r = planCreditReminders([
      used,
      opp({ status: 'claimed', expires_at: new Date(2026, 10, 1).toISOString() }),
      opp({ status: 'dismissed', type: 'promo', category: 'promos', expires_at: new Date(2026, 10, 1).toISOString() }),
    ], [rec(used.id, 10)], NOW);
    expect(r).toHaveLength(0);
  });

  it('reminds about promo codes and trials from email', () => {
    const promo = opp({ type: 'promo', category: 'promos', title: '$10 off', merchant: 'Acme', expires_at: new Date(2026, 10, 1).toISOString() });
    const trial = opp({ type: 'free_trial', category: 'returns_trials', title: 'Trial ends', merchant: 'StreamCo', value_estimate: null, expires_at: new Date(2026, 10, 1).toISOString() });
    const r = planCreditReminders([promo, trial], [], NOW);
    expect(r.find((x) => x.opportunityId === promo.id)!.title).toBe('Your Acme code expires in a week');
    expect(r.find((x) => x.opportunityId === trial.id && x.id.endsWith('2d'))!.title).toBe('StreamCo trial ends in 2 days');
  });

  it('still reminds about credits with unverified amounts', () => {
    const r = planCreditReminders([opp({ value_estimate: null, expires_at: new Date(2026, 10, 1).toISOString() })], [], NOW);
    expect(r).toHaveLength(2);
    expect(r[0]!.body.startsWith('Your ')).toBe(true);
  });

  it('caps the number of reminders', () => {
    const many = Array.from({ length: 40 }, (_, i) => opp({ user_card_id: `card-${i}`, expires_at: new Date(2026, 10, 1).toISOString() }));
    expect(planCreditReminders(many, [], NOW)).toHaveLength(MAX_REMINDERS);
  });
});

describe('claim follow-ups', () => {
  const NOW2 = new Date('2026-10-25T08:00:00');
  it('asks whether the money arrived on the check date', () => {
    const plan = planCreditReminders(
      [
        opp({ id: 'asked', type: 'price_drop', merchant: 'Target', title: 'Price drop on TV', status: 'open', expires_at: null, claim_started_at: '2026-10-24T09:00:00Z', claim_check_after: '2026-10-28T09:00:00Z' }),
        opp({ id: 'done', type: 'refund', status: 'claimed', expires_at: null, claim_started_at: '2026-10-20T09:00:00Z', claim_check_after: '2026-10-28T09:00:00Z' }),
      ],
      [],
      NOW2,
    );
    expect(plan.map((r) => [r.id, r.title])).toEqual([['remind-asked-arrived', 'Did your Target money arrive?']]);
  });

  it('groups one card’s credits that reset the same day into one reminder', () => {
    const end = new Date(NOW.getTime() + 10 * 86_400_000).toISOString();
    const plan = planCreditReminders(
      [
        opp({ id: 'uber', title: 'Uber Cash', value_estimate: 10, expires_at: end, user_card_id: 'gold' }),
        opp({ id: 'dining', title: 'Dining credit', value_estimate: 10, expires_at: end, user_card_id: 'gold' }),
        opp({ id: 'dunkin', title: 'Dunkin’ credit', value_estimate: 7, expires_at: end, user_card_id: 'gold' }),
        opp({ id: 'other', title: 'Airline credit', value_estimate: 100, expires_at: end, user_card_id: 'boa' }),
      ],
      [rec('dining', 4)],
      NOW,
    );
    const twoDay = plan.filter((r) => r.id.endsWith('-2d'));
    expect(twoDay).toHaveLength(2);
    const gold = twoDay.find((r) => r.id.startsWith('remind-gold-'))!;
    expect(gold.title).toBe('$23 in card credits resets in 2 days');
    expect(gold.body).toBe('Uber Cash $10 · Dining credit $6 · Dunkin’ credit $7. Use them or lose them.');
    expect(twoDay.find((r) => r.opportunityId === 'other')!.title).toBe('Airline credit resets in 2 days');
  });
});
