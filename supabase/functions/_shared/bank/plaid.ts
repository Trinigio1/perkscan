import type { BankProvider, LinkStart, SyncPage } from './provider.ts';
import type { BankAccount, BankTxn } from './transactions.ts';

// Plaid, over its REST API (no SDK: fewer dependencies in the edge function).
//   PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV = sandbox | production
// Links use Hosted Link (a Plaid web page), so connecting works in Expo Go; the public token comes back
// by the SESSION_FINISHED webhook. Webhooks are verified as Plaid documents: an ES256 JWT in the
// Plaid-Verification header, signed by a key fetched from Plaid, issued within 5 minutes, carrying the
// SHA-256 of the exact body.

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const HOSTS = { sandbox: 'https://sandbox.plaid.com', production: 'https://production.plaid.com' } as const;
const MAX_AGE_SECONDS = 5 * 60;

export class PlaidError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function plaidProvider(cfg: { clientId: string; secret: string; env: 'sandbox' | 'production'; fetch?: Fetch }): BankProvider {
  const f = cfg.fetch ?? fetch;
  const host = HOSTS[cfg.env];
  const keys = new Map<string, CryptoKey>();

  async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await f(`${host}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: cfg.clientId, secret: cfg.secret, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // Plaid's own message, never our keys (they're only in the request).
    if (!res.ok) throw new PlaidError(String(data.error_code ?? res.status), String(data.error_message ?? `Plaid ${path} failed`));
    return data as T;
  }

  async function verifyKey(kid: string): Promise<CryptoKey | null> {
    const cached = keys.get(kid);
    if (cached) return cached;
    const { key } = await call<{ key: JsonWebKey & { expired_at?: number | null } }>('/webhook_verification_key/get', { key_id: kid });
    if (!key || key.expired_at) return null;
    const k = await crypto.subtle.importKey('jwk', { kty: key.kty, crv: key.crv, x: key.x, y: key.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    keys.set(kid, k);
    return k;
  }

  return {
    name: 'plaid',

    async createLink({ userId, webhook, completionRedirect }): Promise<LinkStart> {
      const r = await call<{ link_token: string; expiration: string; hosted_link_url?: string }>('/link/token/create', {
        client_name: 'PerkScan',
        user: { client_user_id: userId },
        products: ['transactions'],
        transactions: { days_requested: 180 },
        country_codes: ['US'],
        language: 'en',
        webhook,
        hosted_link: completionRedirect ? { completion_redirect_uri: completionRedirect } : {},
      });
      return { linkToken: r.link_token, url: r.hosted_link_url ?? null, expiration: r.expiration };
    },

    async exchange(publicToken) {
      const r = await call<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token: publicToken });
      return { accessToken: r.access_token, itemId: r.item_id };
    },

    async accounts(accessToken) {
      const r = await call<{ accounts: BankAccount[]; item: { institution_id?: string | null } }>('/accounts/get', { access_token: accessToken });
      let institutionName: string | null = null;
      if (r.item?.institution_id) {
        try {
          const i = await call<{ institution: { name: string } }>('/institutions/get_by_id', { institution_id: r.item.institution_id, country_codes: ['US'] });
          institutionName = i.institution.name;
        } catch {
          // The name is a nicety; the connection works without it.
        }
      }
      const accounts = r.accounts.map((a) => ({ account_id: a.account_id, name: a.name, mask: a.mask, type: a.type, subtype: a.subtype }));
      return { accounts, institutionName };
    },

    async sync(accessToken, cursor): Promise<SyncPage> {
      const r = await call<{ added: BankTxn[]; modified: BankTxn[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean }>('/transactions/sync', {
        access_token: accessToken,
        ...(cursor ? { cursor } : {}),
        count: 500,
      });
      return { added: r.added, modified: r.modified, removed: r.removed, nextCursor: r.next_cursor, hasMore: r.has_more };
    },

    async remove(accessToken) {
      await call('/item/remove', { access_token: accessToken });
    },

    async verifyWebhook(rawBody, headers, now = new Date()) {
      const jwt = headers.get('plaid-verification');
      if (!jwt) return false;
      const parts = jwt.split('.');
      if (parts.length !== 3) return false;
      try {
        const header = JSON.parse(new TextDecoder().decode(b64url(parts[0]!))) as { alg?: string; kid?: string };
        if (header.alg !== 'ES256' || !header.kid) return false;
        const key = await verifyKey(header.kid);
        if (!key) return false;
        const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64url(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
        if (!ok) return false;
        const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1]!))) as { iat?: number; request_body_sha256?: string };
        const age = now.getTime() / 1000 - (claims.iat ?? 0);
        if (!claims.iat || age > MAX_AGE_SECONDS || age < -60) return false;
        const digest = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody)));
        return !!claims.request_body_sha256 && sameText(digest, claims.request_body_sha256);
      } catch {
        return false;
      }
    },
  };
}
