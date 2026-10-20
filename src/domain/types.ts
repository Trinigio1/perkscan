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
  expires_at: string | null;
  status: OpportunityStatus;
  user_card_id: string | null;
  benefit_id: string | null;
  period_start: string | null;
  action_steps: { step: string; url?: string }[];
  created_at: string;
}

export interface Recovered {
  id: string;
  opportunity_id: string | null;
  amount: number;
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
