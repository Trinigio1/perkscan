import type { BankAccount, BankTxn } from './transactions.ts';

// What PerkScan needs from a bank-data provider. Plaid is the first; another (MX, Teller, Finicity)
// only has to implement this. Every call runs server-side with keys from the environment.

export interface LinkStart {
  linkToken: string;
  /** A web page the app opens to connect (Plaid Hosted Link), so no native SDK is needed. */
  url: string | null;
  expiration: string;
}

export interface SyncPage {
  added: BankTxn[];
  modified: BankTxn[];
  removed: { transaction_id: string }[];
  nextCursor: string;
  hasMore: boolean;
}

export interface BankProvider {
  name: 'plaid';
  createLink(p: { userId: string; webhook: string; completionRedirect?: string | null }): Promise<LinkStart>;
  exchange(publicToken: string): Promise<{ accessToken: string; itemId: string }>;
  accounts(accessToken: string): Promise<{ accounts: BankAccount[]; institutionName: string | null }>;
  sync(accessToken: string, cursor: string | null): Promise<SyncPage>;
  remove(accessToken: string): Promise<void>;
  /** True only for a request the provider really signed, recently, with this exact body. */
  verifyWebhook(rawBody: string, headers: Headers, now?: Date): Promise<boolean>;
}
