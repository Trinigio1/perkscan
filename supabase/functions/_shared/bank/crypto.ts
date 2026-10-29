// Bank access tokens are encrypted before they're stored (AES-256-GCM), with a key that only exists in
// the edge function's environment (BANK_TOKEN_KEY, 32 random bytes, base64). A database leak alone
// never exposes a token.

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function tokenKey(base64Key: string): Promise<CryptoKey> {
  const raw = unb64(base64Key.trim());
  if (raw.length !== 32) throw new Error('BANK_TOKEN_KEY must be 32 bytes, base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** "v1:<iv>:<ciphertext>", base64. */
export async function seal(plain: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function unseal(sealed: string, key: CryptoKey): Promise<string> {
  const [v, iv, ct] = sealed.split(':');
  if (v !== 'v1' || !iv || !ct) throw new Error('Unknown token format');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct)));
}
