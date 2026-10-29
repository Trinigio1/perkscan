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
/**
 * The one-time catch-up (Gmail script: scanPastYear, rereadAll) may send faster, so a year of mail is
 * read in hours, not a day. Only while the user's last 7 days stay under CATCHUP_WEEKLY_LIMIT: a burst,
 * not a permanent higher rate. The monthly AI budget cap applies either way.
 */
export const CATCHUP_HOURLY_LIMIT = 500;
export const CATCHUP_WEEKLY_LIMIT = 5000;

export interface StoreResult {
  ids: string[];
  duplicates: number;
  /** Marketing from a store the user hid ("Hide offers from this store"). Never stored or read. */
  muted?: number;
  /** Marketing over the weekly limit for that store (daily promos add nothing new). Never stored or read. */
  capped?: number;
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

export async function storeMessages(
  db: SupabaseClient,
  userId: string,
  source: Source,
  messages: IncomingMessage[],
  opts: { reread?: boolean; catchup?: boolean } = {},
): Promise<StoreResult> {
  const result: StoreResult = { ids: [], duplicates: 0, securityCodes: 0 };

  const receivedSince = async (ms: number) => {
    const { count } = await db.from('inbound_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('received_at', new Date(Date.now() - ms).toISOString());
    return count ?? 0;
  };
  const lastHour = (await receivedSince(3600_000)) + messages.length;
  if (lastHour > HOURLY_LIMIT) {
    const catchingUp = opts.catchup && source === 'email' && lastHour <= CATCHUP_HOURLY_LIMIT && (await receivedSince(7 * 86_400_000)) + messages.length <= CATCHUP_WEEKLY_LIMIT;
    if (!catchingUp) return { ...result, error: 'rate_limited' };
  }

  const mutes = source === 'email' ? await mutedStores(db, userId) : new Set<string>();
  // Dates are written in the user's own time zone, so "tonight's order" lands on the right day.
  const { data: prof } = await db.from('profiles').select('timezone').eq('id', userId).maybeSingle();
  const tz = (prof?.timezone as string | undefined) ?? null;
  for (const m of messages) {
    const body = [m.subject, m.text, m.html].filter(Boolean).join('\n');
    if (containsSecurityCode(body)) {
      result.securityCodes += 1;
      continue;
    }
    // Marketing only: receipts, bills, alerts and anything about the user's own account always go through.
    if (source === 'email' && !mustRead(m.subject)) {
      const domain = fromDomain(m.from);
      const key = domainKey(domain);
      if (key && mutes.has(key)) {
        result.muted = (result.muted ?? 0) + 1;
        continue;
      }
      // An email already stored (sent again to be re-read) is never "over the limit": it's one of the ones counted.
      const known = m.id ? (await db.from('inbound_messages').select('id').eq('user_id', userId).eq('source', source).eq('external_id', m.id).maybeSingle()).data : null;
      if (!known && domain && (await sentThisWeek(db, userId, domain, sentAt(m.date) ?? new Date().toISOString())) >= WEEKLY_MARKETING_LIMIT) {
        result.capped = (result.capped ?? 0) + 1;
        continue;
      }
    }
    const externalId = m.id ?? (source === 'email' ? null : await textId(source, m.text ?? m.html ?? ''));
    // Store only the cleaned text the model needs (links removed, card numbers masked).
    const raw = buildModelInput({ subject: m.subject, from: m.from, date: m.date ?? new Date().toISOString(), text: m.text, html: m.html }, tz);
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

/** Promotional emails read per store per week. A store emailing daily repeats itself; three is plenty. */
export const WEEKLY_MARKETING_LIMIT = 3;

/** Subjects that are about the user's own account or money: never capped or hidden. */
export function mustRead(subject: string | null | undefined): boolean {
  return /receipt|order|invoice|statement|payment|refund|booking|reservation|confirm|shipped|delivered|charged|subscription|renew|membership|trip|itinerary|alert|transaction|credit|balance|reward|points|miles|expir|gift card|voucher|certificate|claim|settlement|trial|account/i.test(subject ?? '');
}

/** "email.uber.com" -> "uber", "mail.courts.co.tt" -> "courts": the same key as the app's store keys. */
export function domainKey(domain: string | null): string | null {
  const parts = (domain ?? '').toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const cc = parts.length >= 3 && parts[parts.length - 1]!.length === 2 && ['co', 'com', 'net', 'org', 'ac'].includes(parts[parts.length - 2]!);
  const k = parts[parts.length - (cc ? 3 : 2)]!.replace(/[^a-z0-9]/g, '');
  return k.length >= 3 ? k : null;
}

async function mutedStores(db: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data } = await db.from('store_mutes').select('store_key').eq('user_id', userId);
  return new Set(((data ?? []) as { store_key: string }[]).map((r) => r.store_key));
}

/** How many emails from this sender were stored for the week (Monday to Sunday) the email was sent in. */
async function sentThisWeek(db: SupabaseClient, userId: string, domain: string, sent: string): Promise<number> {
  const d = new Date(sent);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const { count } = await db
    .from('inbound_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('from_domain', domain)
    .gte('sent_at', start.toISOString())
    .lt('sent_at', end.toISOString());
  return count ?? 0;
}
