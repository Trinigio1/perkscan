import { tokenKey } from './crypto.ts';
import { plaidProvider } from './plaid.ts';
import type { BankProvider } from './provider.ts';

/** The bank provider and token key from the environment; both null until the secrets are set. */
export async function bankConfig(): Promise<{ provider: BankProvider | null; key: CryptoKey | null; webhookUrl: string }> {
  const clientId = Deno.env.get('PLAID_CLIENT_ID');
  const secret = Deno.env.get('PLAID_SECRET');
  const env = Deno.env.get('PLAID_ENV') === 'production' ? 'production' : 'sandbox';
  const rawKey = Deno.env.get('BANK_TOKEN_KEY');
  let key: CryptoKey | null = null;
  try {
    key = rawKey ? await tokenKey(rawKey) : null;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
  }
  return {
    provider: clientId && secret ? plaidProvider({ clientId, secret, env }) : null,
    key,
    webhookUrl: Deno.env.get('BANK_WEBHOOK_URL') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/bank-webhook`,
  };
}
