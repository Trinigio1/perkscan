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

export async function storeMessages(db: SupabaseClient, userId: string, source: Source, messages: IncomingMessage[], opts: { reread?: boolean } = {}): Promise<StoreResult> {
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
    // Store only the cleaned text the model needs (links removed, card numbers masked).
    const raw = buildModelInput({ subject: m.subject, from: m.from, date: m.date ?? new Date().toISOString(), text: m.text, html: m.html });
    const { data, error } = await db
      .from('inbound_messages')
      .insert({
        user_id: userId,
        source,
        external_id: externalId,
        from_domain: fromDomain(m.from),
        sent_at: sentAt(m.date),
        raw_body: raw,
      })
      .select('id')
      .single();
    if (error?.code === '23505') {
      // Sent before. If PerkScan couldn't read it then (its text is deleted within 24 hours), read it again now.
      const again = await requeueUnread(db, userId, source, externalId, raw, opts.reread ?? false, sentAt(m.date));
      if (again) result.ids.push(again);
      else result.duplicates += 1;
    } else if (error) return { ...result, error: 'store_failed' };
    else result.ids.push(data.id as string);
  }
  return result;
}

/**
 * A message sent again that failed to be read the first time: put its text back and queue it.
 * Messages already read stay duplicates, unless `reread` asks for everything to be read again with
 * the current reader (offers it finds again are duplicates and aren't added twice). Returns the
 * message id if it was queued again.
 */
async function requeueUnread(db: SupabaseClient, userId: string, source: Source, externalId: string | null, raw: string, reread: boolean, sent: string | null): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await db
    .from('inbound_messages')
    .update({ raw_body: raw, parse_status: 'pending', parse_error: null, attempts: 0, ...(sent ? { sent_at: sent } : {}) })
    .eq('user_id', userId)
    .eq('source', source)
    .eq('external_id', externalId)
    .in('parse_status', reread ? ['failed', 'parsed', 'ignored'] : ['failed'])
    .select('id')
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** When the email was sent, from its Date, if it's a real date not in the future. */
function sentAt(date: string | null | undefined): string | null {
  const t = date ? new Date(date) : null;
  return t && !Number.isNaN(t.getTime()) && t.getTime() <= Date.now() + 86_400_000 ? t.toISOString() : null;
}
