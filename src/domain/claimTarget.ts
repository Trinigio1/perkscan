import { claimHelp } from './claims';
import { domainStoreKey, storeKey } from './deals';
import type { CardBenefit, Opportunity } from './types';

// "Claim": one button on every perk that takes you to where you actually use it — the store's
// site with your code copied, the Lyft app for a Lyft credit, the official form for a settlement.
// Only official destinations: an address from the item itself, the domain the email came from,
// the issuer's own terms page, or a short list of well-known merchant sites below. Pure, tested.

export interface ClaimTarget {
  /** Button text: "Claim", "Use at target.com", "Open Lyft". */
  label: string;
  /** Where to go. Null when the claim starts on PerkScan's own item screen (a request to send). */
  url: string | null;
  /** Copied to the clipboard first (a promo or gift card code). */
  copy: string | null;
  /** One short line under the button: what pressing it does. */
  hint: string;
  /** Requests to send live on the item's screen. */
  openItem: boolean;
  /** What to ask a few days later: did the money come back, or did you use it? */
  followUp: 'arrived' | 'used';
}

/** Card credits that are spent at one merchant: where to spend them. Official sites only. */
const MERCHANTS: { match: RegExp; name: string; url: string }[] = [
  { match: /\blyft\b/i, name: 'Lyft', url: 'https://www.lyft.com' },
  { match: /\bdoordash\b/i, name: 'DoorDash', url: 'https://www.doordash.com' },
  { match: /\buber\b/i, name: 'Uber', url: 'https://www.uber.com' },
  { match: /\bpeloton\b/i, name: 'Peloton', url: 'https://www.onepeloton.com' },
  { match: /\bapple tv\+?|apple music\b/i, name: 'Apple TV+', url: 'https://tv.apple.com' },
  { match: /\bclear\+?\b/i, name: 'CLEAR', url: 'https://www.clearme.com' },
  { match: /\bglobal entry\b/i, name: 'Trusted Traveler Programs', url: 'https://ttp.cbp.dhs.gov' },
  { match: /\btsa precheck\b/i, name: 'TSA PreCheck', url: 'https://www.tsa.gov/precheck' },
  { match: /\bdunkin/i, name: 'Dunkin’', url: 'https://www.dunkindonuts.com' },
  { match: /\bresy\b/i, name: 'Resy', url: 'https://resy.com' },
  { match: /\bsaks\b/i, name: 'Saks', url: 'https://www.saksfifthavenue.com' },
  { match: /\bstubhub\b/i, name: 'StubHub', url: 'https://www.stubhub.com' },
  { match: /\bwalmart\+?/i, name: 'Walmart+', url: 'https://www.walmart.com/plus' },
  { match: /\blululemon\b/i, name: 'lululemon', url: 'https://shop.lululemon.com' },
  { match: /\bpriority pass\b/i, name: 'Priority Pass', url: 'https://www.prioritypass.com' },
];

/** A merchant site for a perk's name, if it's one PerkScan knows. */
export function merchantSite(name: string): { name: string; url: string } | null {
  const m = MERCHANTS.find((x) => x.match.test(name));
  return m ? { name: m.name, url: m.url } : null;
}

const https = (u: string | null | undefined): string | null => (u && /^https:\/\/[^\s]+$/i.test(u) ? u : null);
/** The main domain: "email.marriott.com" -> "marriott.com", "news.courts.co.tt" -> "courts.co.tt". */
export function mainDomain(domain: string): string {
  const parts = domain.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  const cc = parts.length >= 3 && parts[parts.length - 1]!.length === 2 && ['co', 'com', 'net', 'org', 'ac'].includes(parts[parts.length - 2]!);
  return parts.slice(-(cc ? 3 : 2)).join('.');
}
/** "target.com" -> "https://www.target.com"; schools and government aren't shops. */
const siteFor = (domain: string | null | undefined): string | null =>
  domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) && !/\.(gov|edu)(\.[a-z]{2})?$/i.test(domain) ? `https://www.${mainDomain(domain)}` : null;
const hostOf = (url: string) => url.replace(/^https:\/\//, '').replace(/^www\./, '').split('/')[0]!;

/** Domains that send email for other companies, and mail providers: never the store itself. */
const NOT_THE_STORE = /(^|\.)(klaviyomail|klaviyo|shopifyemail|shopify|sendgrid|mailchimp|mailchimpapp|mcsv|mcdlv|list-manage|amazonses|sparkpostmail|mailgun|exacttarget|rsys\d*|bluehornet|cmail\d*|createsend|constantcontact|hubspotemail|hs-email|salesforce|marketingcloud|braze|iterable|sailthru|emarsys|mandrillapp|postmarkapp|gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail)\.[a-z.]+$/i;

/**
 * The store's own site, from the domain its email came from — but only when that domain is
 * clearly the store's ("target.com" for Target, "ulta.com" for Ulta Beauty). Emails sent through
 * a mailing service, or forwarded from your own inbox, don't count.
 */
export function storeSiteFromEmail(domain: string | null | undefined, merchant: string | null | undefined): string | null {
  const site = siteFor(domain);
  if (!site || NOT_THE_STORE.test(domain!)) return null;
  if (!merchant) return null;
  const fromDomain = domainStoreKey(domain!);
  const store = storeKey(merchant);
  if (!fromDomain || store.length < 3) return null;
  const same = fromDomain === store || (fromDomain.length >= 4 && store.startsWith(fromDomain)) || (store.length >= 4 && fromDomain.startsWith(store));
  return same ? site : null;
}

export interface ClaimTargetInput {
  opp: Opportunity & { sender_domain?: string | null };
  benefit?: Pick<CardBenefit, 'name' | 'source_url'> | null;
}

export function claimTarget({ opp, benefit }: ClaimTargetInput): ClaimTarget | null {
  if (opp.status !== 'open') return null;
  const stepUrl = https(opp.action_steps.find((s) => s.url)?.url);
  const fromEmail = storeSiteFromEmail(opp.sender_domain, opp.merchant);

  // Money you ask for: the request is written on the item's own screen.
  const help = claimHelp({ opp });
  if (help && help.kind !== 'settlement') {
    return { label: 'Claim', url: null, copy: null, hint: help.kind === 'card_claim' ? 'Your claim details, ready to copy' : 'PerkScan writes the request for you', openItem: true, followUp: 'arrived' };
  }

  switch (opp.type) {
    case 'settlement':
      return stepUrl ? { label: 'Claim', url: stepUrl, copy: null, hint: 'Opens the official claim form', openItem: false, followUp: 'arrived' } : null;

    case 'card_credit': {
      const where = merchantSite(`${opp.title} ${benefit?.name ?? ''}`);
      if (where) return { label: `Open ${where.name}`, url: where.url, copy: null, hint: `Use your credit at ${hostOf(where.url)}`, openItem: false, followUp: 'used' };
      const terms = https(benefit?.source_url) ?? stepUrl;
      return terms ? { label: 'How to use it', url: terms, copy: null, hint: `Opens ${hostOf(terms)}`, openItem: false, followUp: 'used' } : null;
    }

    case 'promo':
    case 'gift_card':
    case 'store_credit':
    case 'travel_credit':
    case 'certificate':
    case 'points':
    case 'free_trial':
    case 'benefit': {
      const url = stepUrl ?? fromEmail;
      if (!url && !opp.code) return null;
      const code = opp.code ?? null;
      const host = url ? hostOf(url) : null;
      const label = opp.type === 'free_trial' ? 'Manage trial' : host ? `Use at ${host}` : 'Copy code';
      const hint = code && host ? `Copies ${code}, then opens ${host}` : code ? `Copies ${code}` : `Opens ${host}`;
      return { label, url, copy: code, hint, openItem: false, followUp: 'used' };
    }

    default:
      return null;
  }
}

/** The question to ask a few days after a claim started. */
export const followUpQuestion = (o: Pick<Opportunity, 'type'>) =>
  o.type === 'refund' || o.type === 'price_drop' || o.type === 'settlement' || o.type === 'protection' ? 'Did it arrive?' : 'Did you use it?';
