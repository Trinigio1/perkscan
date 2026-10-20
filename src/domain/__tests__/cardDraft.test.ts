import { draftToRow, emptyDraft, validateDraft } from '../cardDraft';

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
