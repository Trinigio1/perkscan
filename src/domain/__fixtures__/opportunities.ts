import type { Opportunity, Recovered } from '../types';

let n = 0;
export function opp(partial: Partial<Opportunity>): Opportunity {
  n += 1;
  return {
    id: `opp-${n}`,
    user_id: 'u1',
    type: 'card_credit',
    category: 'card_credits',
    title: `Credit ${n}`,
    description: null,
    value_estimate: 10,
    expires_at: null,
    status: 'open',
    user_card_id: 'uc1',
    benefit_id: `b${n}`,
    period_start: null,
    action_steps: [],
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

export function rec(opportunity_id: string, amount: number, recovered_at = '2026-06-01T00:00:00Z'): Recovered {
  n += 1;
  return { id: `rec-${n}`, opportunity_id, amount, recovered_at };
}
