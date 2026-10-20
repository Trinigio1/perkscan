import { costUsd, parseEmail, type ModelCall } from '../parse.ts';

const valid = {
  kind: 'promo',
  merchant: 'Acme Outfitters',
  summary: '20% off code from Acme',
  receipt: null,
  offers: [{ type: 'promo', title: '20% off your next order', amount: null, percent_off: 20, code: 'SPRING20', expires_on: '2026-04-30', min_spend: null, points: null, claim_url: null, details: null }],
};

const reply = (text: string | null, stopReason = 'end_turn') => ({ text, stopReason, inputTokens: 1000, outputTokens: 200 });

function fake(...replies: ReturnType<typeof reply>[]): ModelCall & { calls: number } {
  const fn = (async () => {
    fn.calls += 1;
    const r = replies.shift();
    if (!r) throw new Error('no more replies');
    return r;
  }) as ModelCall & { calls: number };
  fn.calls = 0;
  return fn;
}

describe('parseEmail', () => {
  it('accepts a valid first response', async () => {
    const call = fake(reply(JSON.stringify(valid)));
    const r = await parseEmail('email', call);
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
    expect(call.calls).toBe(1);
  });

  it('retries once on invalid JSON', async () => {
    const call = fake(reply('{not json'), reply(JSON.stringify(valid)));
    const r = await parseEmail('email', call);
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(r.usage).toEqual({ inputTokens: 2000, outputTokens: 400 });
  });

  it('fails after two invalid responses', async () => {
    const call = fake(reply('{}'), reply(JSON.stringify({ ...valid, kind: 'nope' })));
    const r = await parseEmail('email', call);
    expect(r.ok).toBe(false);
    expect(call.calls).toBe(2);
    if (!r.ok) expect(r.retryable).toBe(false);
  });

  it('does not retry a refusal', async () => {
    const call = fake(reply(null, 'refusal'));
    const r = await parseEmail('email', call);
    expect(r.ok).toBe(false);
    expect(call.calls).toBe(1);
  });

  it('marks API errors as retryable later without a second call now', async () => {
    const call = (async () => {
      throw new Error('overloaded');
    }) as ModelCall;
    const r = await parseEmail('email', call);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryable).toBe(true);
      expect(r.error).toContain('overloaded');
    }
  });

  it('normalizes values it does not trust', async () => {
    const messy = {
      ...valid,
      kind: 'receipt',
      receipt: { total: -5, currency: 'usd', purchase_date: '2026-02-30', card_last_four: '4242 ', order_number: ' A1 ', return_by: null, return_window_days: 900, items: [] },
      offers: [{ ...valid.offers[0], code: 'HAS SPACES', percent_off: 250, expires_on: 'next week' }],
    };
    const r = await parseEmail('email', fake(reply(JSON.stringify(messy))));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.receipt).toMatchObject({ total: null, currency: 'USD', purchase_date: null, card_last_four: null, order_number: 'A1', return_window_days: null });
      expect(r.data.offers[0]).toMatchObject({ code: null, percent_off: null, expires_on: null });
    }
  });
});

describe('costUsd', () => {
  it('uses Haiku 5.5 prices', () => {
    expect(costUsd({ inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(0.1);
    expect(costUsd({ inputTokens: 3000, outputTokens: 500 })).toBeCloseTo(0.00055);
  });
});
