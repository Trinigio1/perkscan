// Turns a raw email into compact plain text for the model: strips HTML, tracking
// pixels, links, footers and signatures, and masks anything that looks like a full
// card number. Pure and dependency-free so it runs in Deno (Edge Functions) and Jest.

export interface RawEmail {
  subject?: string | null;
  from?: string | null;
  date?: string | null;
  text?: string | null;
  html?: string | null;
}

/** Keeps requests small: most of what matters in a receipt or promo is near the top. */
export const MAX_MODEL_CHARS = 12_000;

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…',
  copy: '©', reg: '®', trade: '™', zwnj: '', zwj: '', shy: '',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith('#x')) return safeChar(parseInt(lower.slice(2), 16), m);
    if (lower.startsWith('#') && lower !== '#39') return safeChar(parseInt(lower.slice(1), 10), m);
    return ENTITIES[lower] ?? m;
  });
}

function safeChar(cp: number, fallback: string): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return fallback;
  // Zero-width and other invisible characters are common in marketing emails.
  if ([0x200b, 0x200c, 0x200d, 0xfeff, 0x034f, 0x00ad].includes(cp)) return '';
  return String.fromCodePoint(cp);
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|head|title|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<img[^>]*>/gi, ' ') // tracking pixels and images
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|header|footer)>/gi, '\n')
      .replace(/<(td|th)[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

/** Luhn check, so we mask real card numbers but leave order numbers alone. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Words that introduce long numbers that aren't card numbers. */
const NOT_A_CARD = /(order|confirmation|tracking|invoice|ref(erence)?|account|member|booking|ticket|#)\W{0,4}$/i;

export function maskCardNumbers(s: string): string {
  return s.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m, offset: number) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return m;
    // Card numbers start with 2-6 (Mastercard, Amex/Diners, Visa, Mastercard, Discover).
    if (!/^[2-6]/.test(digits) || !luhnValid(digits)) return m;
    if (NOT_A_CARD.test(s.slice(Math.max(0, offset - 24), offset))) return m;
    return `•••• ${digits.slice(-4)}`;
  });
}

const FOOTER = /(unsubscribe|manage (your )?(email |subscription |notification )?preferences|update your preferences|view (this email |it )?in (your |a )?browser|you('re| are) receiving this|this email was sent to|privacy policy|all rights reserved|©\s*\d{4})/i;
const SIGNATURE = /^(--\s*|sent from my (iphone|ipad|android|mobile).*|get outlook for .*)$/i;

export function cleanEmailText(input: string): string {
  let s = input.replace(/\r\n?/g, '\n');
  s = s.replace(/https?:\/\/[^\s<>"')\]]+/gi, (url) => {
    const host = /^https?:\/\/([^/?#:]+)/i.exec(url)?.[1]?.replace(/^www\./, '');
    return host ? `[link: ${host}]` : '[link]';
  });
  s = maskCardNumbers(s);

  const lines = s.split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim());
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (SIGNATURE.test(line)) break;
    // Footer markers in the last 40% of the email: drop everything from here on.
    if (FOOTER.test(line) && i > lines.length * 0.6) break;
    if (FOOTER.test(line)) continue;
    if (/^\[link(: [^\]]+)?\]$/.test(line)) continue; // lines that were only a link
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac']);

/** "Acme <orders@shop.acme.com>" -> "acme.com". Only the domain is ever stored. */
export function fromDomain(from: string | null | undefined): string | null {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(from ?? '');
  if (!m) return null;
  const parts = m[1]!.toLowerCase().split('.');
  // Country domains like "courts.co.tt" or "store.com.jm" keep three labels, or every store would be "co.tt".
  const keep = parts.length >= 3 && parts[parts.length - 1]!.length === 2 && SECOND_LEVEL.has(parts[parts.length - 2]!) ? 3 : 2;
  return parts.slice(-keep).join('.');
}

/** A valid IANA time zone, else UTC (a bad value must never break reading). */
const zone = (tz: string | null | undefined) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC' });
    return tz || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** The calendar day an instant falls on where the user lives (YYYY-MM-DD): an order at 9pm in Miami is that day, not the next UTC day. */
export function localDay(iso: string, tz?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "2026-10-28 21:30 (America/New_York)": the email's Date in the user's own time zone. */
export function localDateTime(iso: string, tz?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const z = zone(tz);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${localDay(iso, z)} ${time} (${z})`;
}

/** The exact text sent to the model. The sender is reduced to a domain; the date is in the user's time zone. */
export function buildModelInput(email: RawEmail, tz?: string | null): string {
  const body = email.html && (!email.text || email.text.trim().length < 40) ? htmlToText(email.html) : email.text ?? '';
  const cleaned = cleanEmailText(body);
  const header = [
    email.subject ? `Subject: ${email.subject.trim()}` : null,
    fromDomain(email.from) ? `From domain: ${fromDomain(email.from)}` : null,
    email.date ? `Date: ${localDateTime(email.date, tz)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const text = `${header}\n\n${cleaned}`.trim();
  return text.length > MAX_MODEL_CHARS ? `${text.slice(0, MAX_MODEL_CHARS)}\n[truncated]` : text;
}
