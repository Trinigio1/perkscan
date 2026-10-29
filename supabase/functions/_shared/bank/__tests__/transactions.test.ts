import { cleanName, purchaseFrom, type BankAccount, type BankTxn } from '../transactions';

const accounts: BankAccount[] = [
  { account_id: 'cc', name: 'Premium Rewards', mask: '6042', type: 'credit', subtype: 'credit card' },
  { account_id: 'chk', name: 'Checking', mask: '12', type: 'depository', subtype: 'checking' },
  { account_id: 'brk', name: 'Brokerage', mask: '9999', type: 'investment', subtype: 'brokerage' },
];
const txn = (t: Partial<BankTxn>): BankTxn => ({
  transaction_id: 't1', account_id: 'cc', amount: 31.2, iso_currency_code: 'USD', date: '2026-10-20', authorized_date: '2026-10-19',
  name: 'UBER   EATS', merchant_name: 'Uber Eats', pending: false, pending_transaction_id: null,
  personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT' }, ...t,
});

describe('purchaseFrom', () => {
  it('turns a card purchase into a card alert with only the last four digits', () => {
    expect(purchaseFrom(txn({}), accounts)).toEqual({
      kind: 'card_alert', merchant: 'Uber Eats', total: 31.2, currency: 'USD', purchase_date: '2026-10-19', last_four: '6042',
      pending: false, purchase_type: 'food_delivery', bank_txn_id: 't1',
    });
  });

  it('skips money in, transfers, payments, fees and investment accounts', () => {
    expect(purchaseFrom(txn({ amount: -50 }), accounts)).toBeNull();
    expect(purchaseFrom(txn({ personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER' } }), accounts)).toBeNull();
    expect(purchaseFrom(txn({ personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' } }), accounts)).toBeNull();
    expect(purchaseFrom(txn({ personal_finance_category: { primary: 'BANK_FEES', detailed: 'BANK_FEES_ATM_FEES' } }), accounts)).toBeNull();
    expect(purchaseFrom(txn({ account_id: 'brk' }), accounts)).toBeNull();
    expect(purchaseFrom(txn({ iso_currency_code: null }), accounts)).toBeNull();
  });

  it('keeps no digits when the account shows fewer than four, and names messy merchants', () => {
    const p = purchaseFrom(txn({ account_id: 'chk', merchant_name: null, name: 'SQ *BLUE BOTTLE COFFEE 12345', personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } }), accounts)!;
    expect(p.last_four).toBeNull();
    expect(p.merchant).toBe('Blue Bottle Coffee');
    expect(p.purchase_type).toBe('restaurant');
  });

  it('reads the kind of purchase from the category', () => {
    const type = (detailed: string, merchant = 'Store') => purchaseFrom(txn({ merchant_name: merchant, personal_finance_category: { primary: detailed.split('_')[0]!, detailed } }), accounts)!.purchase_type;
    expect(type('TRAVEL_FLIGHTS', 'American Airlines')).toBe('flight');
    expect(type('TRANSPORTATION_TAXIS_AND_RIDE_SHARES', 'Lyft')).toBe('rideshare');
    expect(type('GENERAL_MERCHANDISE_ELECTRONICS', 'Best Buy')).toBe('electronics');
    expect(type('FOOD_AND_DRINK_GROCERIES', 'Publix')).toBe('groceries');
    expect(type('ENTERTAINMENT_TV_AND_MOVIES', 'Netflix')).toBe('subscription');
  });
});

describe('cleanName', () => {
  it('drops processor prefixes and store numbers', () => {
    expect(cleanName('TST* JOE & THE JUICE #0042 MIAMI')).toBe('Joe & The Juice');
    expect(cleanName('PUBLIX')).toBe('Publix');
  });
});
