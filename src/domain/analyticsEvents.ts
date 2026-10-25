// The only analytics events PerkScan sends, and the only properties each may carry.
// No personal data: no emails, names, stores, card digits, amounts, codes or account ids.
// Anything not listed here is dropped before sending.

type Allowed = 'boolean' | 'small_int' | readonly string[];

export const EVENTS = {
  onboarding_completed: { cards: 'small_int', student: 'boolean' },
  card_added: { count: 'small_int' },
  credit_marked_used: { partial: 'boolean' },
  offer_marked_used: { type: ['promo', 'gift_card', 'store_credit', 'points', 'free_trial', 'return_window', 'settlement', 'protection', 'price_drop', 'refund', 'benefit'] },
  item_added: { type: ['points', 'gift_card', 'store_credit', 'promo', 'benefit', 'refund'] },
  hidden_money_viewed: {},
  deals_viewed: { matched: 'small_int' },
  claim_started: { kind: ['price_adjustment', 'refund', 'duplicate_charge', 'return', 'settlement', 'card_claim', 'use'] },
  deal_claimed: {},
  claim_checked: { result: ['arrived', 'not_yet', 'didnt_work'] },
  deal_feedback: { action: ['saved', 'dismissed', 'didnt_work'] },
  interests_saved: { count: 'small_int' },
  gmail_token_created: {},
  texts_token_created: {},
  text_added: { result: ['parsed', 'security_code', 'duplicate', 'failed'] },
  review_submitted: { verdict: ['right', 'wrong'] },
  checkout_viewed: { has_cards: 'boolean' },
  school_selected: { country: ['TT', 'US', 'other'] },
  student_offer_claimed: {},
  recap_viewed: {},
  share_opened: {},
  data_exported: {},
  account_deleted: {},
} as const satisfies Record<string, Record<string, Allowed>>;

export type EventName = keyof typeof EVENTS;

/** Keeps only the allowed properties with allowed values; everything else is removed. */
export function sanitizeEvent(name: string, props: Record<string, unknown> = {}): { event: EventName; properties: Record<string, string | number | boolean> } | null {
  if (!(name in EVENTS)) return null;
  const spec = EVENTS[name as EventName] as Record<string, Allowed>;
  const properties: Record<string, string | number | boolean> = {};
  for (const [key, rule] of Object.entries(spec)) {
    const v = props[key];
    if (rule === 'boolean' && typeof v === 'boolean') properties[key] = v;
    else if (rule === 'small_int' && typeof v === 'number' && Number.isInteger(v) && v >= 0) properties[key] = Math.min(v, 20); // bucketed: 20 = "20 or more"
    else if (Array.isArray(rule) && typeof v === 'string' && rule.includes(v)) properties[key] = v;
  }
  return { event: name as EventName, properties };
}
