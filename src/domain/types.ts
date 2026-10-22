// Row shapes as returned by Supabase. Kept by hand in step with supabase/migrations.

export type BenefitType = 'credit' | 'protection' | 'perk';
export type BenefitPeriod = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'per_claim';
export type PeriodAnchor = 'calendar' | 'cardmember_year';
export type VerificationStatus = 'active' | 'TODO_VERIFY';

export type OpportunityType =
  | 'card_credit' | 'protection' | 'promo' | 'gift_card' | 'store_credit' | 'points'
  | 'return_window' | 'price_drop' | 'free_trial' | 'settlement' | 'student';
export type OpportunityStatus = 'open' | 'claimed' | 'expired' | 'dismissed';
export type OpportunityCategory =
  | 'card_credits' | 'card_protections' | 'store_credit_gift_cards' | 'promos'
  | 'points_miles' | 'settlements' | 'student' | 'returns_trials';

export interface Card {
  id: string;
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
  onboarded_at: string | null;
}

export interface UserCard {
  id: string;
  user_id: string;
  card_id: string;
  last_four: string;
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
};

/** Display order on the home screen. */
export const CATEGORY_ORDER: OpportunityCategory[] = [
  'card_credits', 'card_protections', 'store_credit_gift_cards', 'promos',
  'points_miles', 'settlements', 'student', 'returns_trials',
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
  status: VerificationStatus;
  source_url: string | null;
  last_verified: string | null;
}
