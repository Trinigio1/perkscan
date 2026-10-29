// A bank transaction becomes a card-alert receipt: the store, the amount, the date and the account's
// last four digits. Nothing else from the bank is kept. Money in, transfers, loan and card payments,
// and bank fees aren't purchases, so they're skipped. Pure, so every rule is tested.

export interface BankTxn {
  transaction_id: string;
  account_id: string;
  /** Positive = money out (a purchase), negative = money in. */
  amount: number;
  iso_currency_code: string | null;
  date: string;
  authorized_date: string | null;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  pending_transaction_id: string | null;
  personal_finance_category?: { primary: string; detailed: string } | null;
}

export interface BankAccount {
  account_id: string;
  name: string;
  mask: string | null;
  type: string | null;
  subtype: string | null;
}

export interface PurchaseRow {
  kind: 'card_alert';
  merchant: string;
  total: number;
  currency: string;
  purchase_date: string;
  last_four: string | null;
  pending: boolean;
  purchase_type: string | null;
  bank_txn_id: string;
}

const NOT_PURCHASES = /^(TRANSFER_IN|TRANSFER_OUT|LOAN_PAYMENTS|INCOME|BANK_FEES)$/;
/** Accounts you pay from. Investment and loan accounts aren't. */
const PAY_ACCOUNTS = /^(credit|depository)$/;

const TYPES: [RegExp, string][] = [
  [/uber ?eats|doordash|grubhub|postmates|instacart|seamless/i, 'food_delivery'],
  [/RIDE_SHARE|TAXI/, 'rideshare'],
  [/FLIGHT|AIRLINE/, 'flight'],
  [/LODGING|HOTEL/, 'hotel'],
  [/RENTAL_CAR/, 'car_rental'],
  [/GROCER/, 'groceries'],
  [/RESTAURANT|FAST_FOOD|COFFEE|FOOD_AND_DRINK/, 'restaurant'],
  [/ELECTRONICS/, 'electronics'],
  [/CLOTHING/, 'clothing'],
  [/TELEPHONE/, 'phone_bill'],
  [/TV_AND_MOVIES|MUSIC_AND_AUDIO|DIGITAL_PURCHASE/, 'subscription'],
  [/GENERAL_MERCHANDISE/, 'other_goods'],
];

/** "SQ *BLUE BOTTLE COFFEE 1234" -> "Blue Bottle Coffee", when the bank gives no clean merchant name. */
export function cleanName(raw: string): string {
  const s = raw
    .replace(/^(sq|tst|sp|pp|paypal|dd|py)\s*\*\s*/i, '')
    .replace(/\s+#?\d{3,}.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) || raw.trim();
}

export function purchaseFrom(t: BankTxn, accounts: BankAccount[]): PurchaseRow | null {
  if (!(t.amount > 0) || !t.iso_currency_code) return null;
  const pfc = t.personal_finance_category;
  if (pfc && NOT_PURCHASES.test(pfc.primary)) return null;
  const account = accounts.find((a) => a.account_id === t.account_id);
  if (account?.type && !PAY_ACCOUNTS.test(account.type)) return null;
  const merchant = (t.merchant_name?.trim() || cleanName(t.name)).slice(0, 120);
  const typeKey = `${merchant} ${pfc?.detailed ?? ''}`;
  return {
    kind: 'card_alert',
    merchant,
    total: Math.round(t.amount * 100) / 100,
    currency: t.iso_currency_code.toUpperCase(),
    purchase_date: t.authorized_date ?? t.date,
    // Only ever the last four digits; masks shorter than that aren't kept.
    last_four: account?.mask && /^\d{4}$/.test(account.mask) ? account.mask : null,
    pending: t.pending,
    purchase_type: TYPES.find(([re]) => re.test(typeKey))?.[1] ?? null,
    bank_txn_id: t.transaction_id,
  };
}
