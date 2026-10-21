import type { SupabaseClient } from '@supabase/supabase-js';
import { buildModelInput, fromDomain, type RawEmail } from './clean.ts';
import { containsSecurityCode } from './security.ts';

// Saves incoming emails and texts for parsing. Shared by the ingest endpoint (Gmail
// script, iPhone Shortcut) and the app's "paste or share a text".

export type Source = 'email' | 'sms' | 'share';

export interface IncomingMessage extends RawEmail {
  id?: string;
}

/** Per user, per hour. Generous for personal use, stops a leaked token from running up AI costs. */
export const HOURLY_LIMIT = 200;

export interface StoreResult {
  ids: string[];
  duplicates: number;
  /** Messages dropped because they contained a sign-in or verification code. Never stored. */
  securityCodes: number;
  error?: 'rate_limited' | 'store_failed';
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Texts have no message id. Use a hash of the text and day, so a Shortcut that fires
 * twice for the same text doesn't create two entries. Only the hash is stored.
 */
export async function textId(source: Source, text: string, day = new Date().toISOString().slice(0, 10)): Promise<string> {
  return `${source}-${day}-${(await sha256Hex(text.trim())).slice(0, 32)}`;
}

export async function storeMessages(db: SupabaseClient, userId: string, source: Source, messages: IncomingMessage[]): Promise<StoreResult> {
  const result: StoreResult = { ids: [], duplicates: 0, securityCodes: 0 };

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from('inbound_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('received_at', since);
  if ((count ?? 0) + messages.length > HOURLY_LIMIT) return { ...result, error: 'rate_limited' };

  for (const m of messages) {
    const body = [m.subject, m.text, m.html].filter(Boolean).join('\n');
    if (containsSecurityCode(body)) {
      result.securityCodes += 1;
      continue;
    }
    const externalId = m.id ?? (source === 'email' ? null : await textId(source, m.text ?? m.html ?? ''));
    const { data, error } = await db
      .from('inbound_messages')
      .insert({
        user_id: userId,
        source,
        external_id: externalId,
        from_domain: fromDomain(m.from),
        // Store only the cleaned text the model needs (links removed, card numbers masked).
        raw_body: buildModelInput({ subject: m.subject, from: m.from, date: m.date ?? new Date().toISOString(), text: m.text, html: m.html }),
      })
      .select('id')
      .single();
    if (error?.code === '23505') result.duplicates += 1;
    else if (error) return { ...result, error: 'store_failed' };
    else result.ids.push(data.id as string);
  }
  return result;
}
