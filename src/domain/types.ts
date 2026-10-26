// Row shapes as returned by Supabase. Kept by hand in step with supabase/migrations.

export type BenefitType = 'credit' | 'protection' | 'perk';
export type BenefitPeriod = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'per_claim';
export type PeriodAnchor = 'calendar' | 'cardmember_year';
export type VerificationStatus = 'active' | 'TODO_VERIFY';

export type OpportunityType =
  | 'card_credit' | 'protection' | 'promo' | 'gift_card' | 'store_credit' | 'points'
  | 'return_window' | 'price_drop' | 'free_trial' | 'settlement' | 'student' | 'refund' | 'benefit'
  | 'travel_credit' | 'certificate';
export type OpportunityStatus = 'open' | 'claimed' | 'expired' | 'dismissed';
export type OpportunityCategory =
  | 'card_credits' | 'card_protections' | 'store_credit_gift_cards' | 'promos'
  | 'points_miles' | 'settlements' | 'student' | 'returns_trials' | 'refunds' | 'benefits';

export interface Card {
  id: string;
  /** A payment card, or a membership (Prime, Costco, a phone plan) that comes with perks. */
  kind: 'card' | 'membership';
  issuer: string;
  product_name: string;
  country: string;
  currency: string;
  annual_fee: number | null;
  status: VerificationStatus;
  source_url: string | null;
  last_verified: string | null;
  sort_order: number;
}

export interface CardBenefit {
  id: string;
  card_id: string;
  type: BenefitType;
  name: string;
  amount: number | null;
  period: BenefitPeriod;
  period_anchor: PeriodAnchor;
  amount_schedule: Record<string, number> | null;
  terms_summary: string | null;
  max_coverage: number | null;
  coverage_window_days: number | null;
  enrollment_required: boolean;
  /** Stores a credit applies at, e.g. { merchants: ['uber', 'uber eats'] }. */
  merchant_match: { merchants: string[] } | null;
  /** Overrides the card currency, e.g. US$ coverage on a TT$ card. */
  currency: string | null;
  status: VerificationStatus;
  source_url: string | null;
  last_verified: string | null;
  notes: string | null;
  sort_order: number;
}

export interface Profile {
  id: string;
  display_name: string | null;
  forwarding_address: string | null;
  is_student: boolean;
  timezone: string;
  country: string | null;
  home_currency: string;
  university_id: string | null;
  onboarded_at: string | null;
  /** What they're into, for Deals for you (ids from INTERESTS). */
  interests?: string[];
  /** US state code, for state-only deals and events. */
  region?: string | null;
  /** Opted in to sharing public promo codes from their email. */
  share_deals?: boolean;
}

export interface UserCard {
  id: string;
  user_id: string;
  card_id: string;
  /** Null for memberships. */
  last_four: string | null;
  open_date: string | null;
  nickname: string | null;
  created_at: string;
}

export interface Opportunity {
  id: string;
  user_id: string;
  type: OpportunityType;
  category: OpportunityCategory;
  title: string;
  description: string | null;
  value_estimate: number | null;
  currency: string;
  expires_at: string | null;
  status: OpportunityStatus;
  user_card_id: string | null;
  benefit_id: string | null;
  period_start: string | null;
  action_steps: { step: string; url?: string }[];
  merchant?: string | null;
  code?: string | null;
  source_message_id?: string | null;
  source_receipt_id?: string | null;
  /** "manual:…" for items the user added by hand. */
  dedupe_key?: string | null;
  /** When the user sent the request or filed the claim. */
  claim_started_at?: string | null;
  /** When to ask whether the money arrived. */
  claim_check_after?: string | null;
  /** The domain of the email it came from ("target.com"), where codes and gift cards get used. */
  sender_domain?: string | null;
  /** What the email's offer is about ("fitness"), as the reader saw it. Older offers have none. */
  interest?: string | null;
  /** "20% off": the percent, when the offer states one (older offers: read from the title). */
  percent_off?: number | null;
  /** Minimum spend to use it, if stated. */
  min_spend?: number | null;
  created_at: string;
}

export interface Receipt {
  id: string;
  merchant: string;
  total: number | null;
  currency: string;
  purchase_date: string | null;
  last_four: string | null;
  purchase_type: string | null;
  matched_user_card_id: string | null;
  /** A store receipt, or a bank's card purchase alert. */
  kind: 'receipt' | 'card_alert';
  /** An authorization the bank hasn't settled yet. */
  pending: boolean;
  /** Departure / pick-up / check-in date for travel bookings. */
  travel_date?: string | null;
  order_number?: string | null;
}

export type ParseStatus = 'pending' | 'parsing' | 'parsed' | 'failed' | 'ignored';

export interface InboundMessage {
  id: string;
  source: 'email' | 'sms' | 'share';
  received_at: string;
  parse_status: ParseStatus;
  parse_error: string | null;
  kind: string | null;
  summary: string | null;
  from_domain: string | null;
  /** Why it gave what it gave ("Already found in an earlier email"), from the reader. */
  read_note?: string | null;
}

export interface IngestToken {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface Recovered {
  id: string;
  opportunity_id: string | null;
  amount: number;
  currency: string;
  recovered_at: string;
}

export interface BenefitUsage {
  id: string;
  user_card_id: string;
  benefit_id: string;
  period_start: string;
  amount_used: number | null;
  is_used: boolean;
  marked_by: 'user' | 'auto';
}

export const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  card_credits: 'Card credits',
  card_protections: 'Card protections',
  store_credit_gift_cards: 'Store credit & gift cards',
  promos: 'Promos',
  points_miles: 'Points & miles',
  settlements: 'Settlements',
  student: 'Student',
  returns_trials: 'Returns & trials',
  refunds: 'Refunds',
  benefits: 'Benefits',
};

/** Display order on the home screen. */
export const CATEGORY_ORDER: OpportunityCategory[] = [
  'card_credits', 'card_protections', 'store_credit_gift_cards', 'promos',
  'points_miles', 'settlements', 'student', 'returns_trials', 'refunds', 'benefits',
];

export interface StudentOffer {
  id: string;
  name: string;
  provider: string;
  category: string;
  summary: string;
  eligibility: string;
  how_to_verify: string;
  url: string;
  /** Empty = available worldwide. */
  countries: string[];
  /** Empty = any school. */
  university_ids: string[];
  status: VerificationStatus;
  source_url: string | null;
  last_verified: string | null;
}

export interface University {
  id: string;
  name: string;
  short_name: string;
  country: string;
  state: string | null;
  /** e.g. ["ufl.edu"]; most student offers verify with a school email. */
  email_domains: string[];
  website: string | null;
}

/** A perk the user added from their own school. Private to them. */
export interface UserPerk {
  id: string;
  university_id: string | null;
  title: string;
  details: string | null;
  url: string | null;
  /** The user agreed PerkScan may review it to add for everyone at the school. */
  suggest: boolean;
  created_at: string;
}
