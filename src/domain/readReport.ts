import { addToBag, type MoneyBag } from './format';
import type { InboundMessage, Opportunity } from './types';

// "What PerkScan read": for every email and text it was sent, what it found, or why it found
// nothing. Shows where value is being missed instead of guessing. Pure, so every rule is tested.

export type ReadOutcome = 'found' | 'receipt' | 'nothing' | 'failed' | 'waiting';

export interface ReadLine {
  message: InboundMessage;
  outcome: ReadOutcome;
  /** What it found ("20% off sitewide"), or why it found nothing. */
  detail: string;
  offers: Opportunity[];
}

export interface ReadReport {
  lines: ReadLine[];
  counts: Record<ReadOutcome, number>;
  /** Offers found in these messages. */
  offers: number;
  /** Stated money among them, per currency. */
  money: MoneyBag;
}

/** Why a message that was read held nothing to use, by what kind of message it was. */
const NOTHING: Record<string, string> = {
  promo: 'A promotion with no code, amount or end date to act on',
  loyalty: 'A points or rewards update with nothing expiring or ready to use',
  gift_card_or_store_credit: 'No balance, code or use-by date was stated',
  trial_or_subscription: 'No trial end date or renewal date was stated',
  settlement: 'No claim deadline or official claim site was stated',
  other: 'A notice or newsletter with nothing to use',
};

function offerLine(o: Opportunity): string {
  const pct = o.percent_off ? `${o.percent_off}% off` : null;
  return o.title + (pct && !o.title.includes('%') ? ` (${pct})` : '');
}

/** A reader error in plain words: the raw API message means nothing to people. */
export function failureText(error: string | null): string {
  if (!error) return 'Couldn’t read this one';
  if (/^Model request failed/i.test(error)) return 'PerkScan couldn’t read this one because of a problem on our side. Its text has been deleted, so it needs to be sent again (Gmail script: resendUnread).';
  if (/cut off/i.test(error)) return 'Too long to read in one go';
  if (/declined/i.test(error)) return 'The reader declined to process this one';
  return 'Couldn’t read this one';
}

export function readReport(messages: InboundMessage[], opportunities: Opportunity[]): ReadReport {
  const byMessage = new Map<string, Opportunity[]>();
  for (const o of opportunities) {
    if (!o.source_message_id) continue;
    byMessage.set(o.source_message_id, [...(byMessage.get(o.source_message_id) ?? []), o]);
  }
  const counts: Record<ReadOutcome, number> = { found: 0, receipt: 0, nothing: 0, failed: 0, waiting: 0 };
  let offers = 0;
  let money: MoneyBag = {};
  const lines = messages.map((m): ReadLine => {
    const found = byMessage.get(m.id) ?? [];
    let outcome: ReadOutcome;
    let detail: string;
    if (m.parse_status === 'failed') {
      outcome = 'failed';
      detail = failureText(m.parse_error);
    } else if (m.parse_status === 'pending' || m.parse_status === 'parsing') {
      outcome = 'waiting';
      detail = m.parse_error ?? 'Waiting to be read';
    } else if (found.length) {
      outcome = 'found';
      detail = found.map(offerLine).join(' · ') + (m.read_note ? ` (also: ${m.read_note.charAt(0).toLowerCase()}${m.read_note.slice(1)})` : '');
      offers += found.length;
      for (const o of found) if (o.value_estimate !== null) money = addToBag(money, o.currency, o.value_estimate);
    } else if (m.kind === 'receipt' || m.kind === 'card_alert') {
      outcome = 'receipt';
      detail = m.kind === 'receipt' ? 'Receipt saved: checked against your card’s protections and price drops' : 'Card purchase saved: checked against your card’s credits';
    } else {
      outcome = 'nothing';
      detail = m.read_note ?? (m.parse_status === 'ignored' ? 'Nothing to use: no offer, receipt or card found' : NOTHING[m.kind ?? 'other'] ?? NOTHING.other!);
    }
    counts[outcome] += 1;
    return { message: m, outcome, detail, offers: found };
  });
  return { lines, counts, offers, money };
}
