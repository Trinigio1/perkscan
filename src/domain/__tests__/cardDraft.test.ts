import { draftToRow, emptyDraft, siblingCards, validateDraft } from '../cardDraft';

const draft = (patch: Partial<ReturnType<typeof emptyDraft>>) => ({ ...emptyDraft('amex_gold'), ...patch });

describe('validateDraft', () => {
  it('requires exactly four digits', () => {
    expect(validateDraft(draft({ last_four: '123' })).last_four).toBeDefined();
    expect(validateDraft(draft({ last_four: '12a4' })).last_four).toBeDefined();
    expect(validateDraft(draft({ last_four: '4111111111111111' })).last_four).toBeDefined();
    expect(validateDraft(draft({ last_four: '1234' }))).toEqual({});
  });

  it('accepts an empty or real open date and rejects impossible ones', () => {
    expect(validateDraft(draft({ last_four: '1234', open_date: '' }))).toEqual({});
    expect(validateDraft(draft({ last_four: '1234', open_date: '2024-02-29' }))).toEqual({});
    expect(validateDraft(draft({ last_four: '1234', open_date: '2023-02-29' })).open_date).toBeDefined();
    expect(validateDraft(draft({ last_four: '1234', open_date: '2023-13-01' })).open_date).toBeDefined();
    expect(validateDraft(draft({ last_four: '1234', open_date: '03/15/2023' })).open_date).toBeDefined();
    expect(validateDraft(draft({ last_four: '1234', open_date: '2999-01-01' })).open_date).toBeDefined();
  });

  it('limits nickname length', () => {
    expect(validateDraft(draft({ last_four: '1234', nickname: 'x'.repeat(61) })).nickname).toBeDefined();
  });
});

describe('draftToRow', () => {
  it('turns blanks into nulls and trims the nickname', () => {
    expect(draftToRow(draft({ last_four: '1234', nickname: '  Gold  ' }))).toEqual({
      card_id: 'amex_gold',
      last_four: '1234',
      open_date: null,
      nickname: 'Gold',
    });
  });
});

describe('siblingCards', () => {
  const card = (id: string, issuer: string, product_name: string) => ({ id, issuer, product_name, kind: 'card' as const, country: 'US' });
  const all = [
    card('boa_premium_rewards', 'Bank of America', 'Bank of America® Premium Rewards®'),
    card('boa_premium_rewards_elite', 'Bank of America', 'Bank of America® Premium Rewards® Elite'),
    card('boa_customized_cash', 'Bank of America', 'Bank of America® Customized Cash Rewards'),
    card('chase_sapphire_preferred', 'Chase', 'Chase Sapphire Preferred®'),
    card('chase_sapphire_reserve', 'Chase', 'Chase Sapphire Reserve®'),
    card('chase_freedom_flex', 'Chase', 'Chase Freedom Flex®'),
    card('amex_delta_gold', 'American Express', 'Delta SkyMiles® Gold American Express Card'),
    card('amex_delta_platinum', 'American Express', 'Delta SkyMiles® Platinum American Express Card'),
    card('amex_gold', 'American Express', 'American Express® Gold Card'),
  ];
  const ids = (id: string) => siblingCards(all.find((c) => c.id === id)!, all).map((c) => c.id);
  it('finds the cards easy to mix up, and only those', () => {
    expect(ids('boa_premium_rewards')).toEqual(['boa_premium_rewards_elite']);
    expect(ids('boa_premium_rewards_elite')).toEqual(['boa_premium_rewards']);
    expect(ids('chase_sapphire_preferred')).toEqual(['chase_sapphire_reserve']);
    expect(ids('amex_delta_gold')).toEqual(['amex_delta_platinum']);
    expect(ids('amex_gold')).toEqual([]);
    expect(ids('boa_customized_cash')).toEqual([]);
  });
});
