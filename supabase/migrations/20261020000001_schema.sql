-- PerkScan core schema.
-- Catalog tables (cards, card_benefits, settlements, student_discounts) are global and
-- read-only for app users. Every other table is owned by a user via user_id.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.benefit_type as enum ('credit', 'protection', 'perk');
create type public.benefit_period as enum ('monthly', 'quarterly', 'semiannual', 'annual', 'per_claim');
create type public.period_anchor as enum ('calendar', 'cardmember_year');
create type public.message_source as enum ('email', 'sms', 'share');
create type public.parse_status as enum ('pending', 'parsing', 'parsed', 'failed', 'ignored');
create type public.usage_marked_by as enum ('user', 'auto');
create type public.opportunity_type as enum (
  'card_credit', 'protection', 'promo', 'gift_card', 'store_credit', 'points',
  'return_window', 'price_drop', 'free_trial', 'settlement', 'student'
);
create type public.opportunity_status as enum ('open', 'claimed', 'expired', 'dismissed');
create type public.opportunity_category as enum (
  'card_credits', 'card_protections', 'store_credit_gift_cards', 'promos',
  'points_miles', 'settlements', 'student', 'returns_trials'
);

-- Maps an opportunity type to the home-screen breakdown category.
create or replace function public.opportunity_category_for(t public.opportunity_type)
returns public.opportunity_category
language sql immutable parallel safe
set search_path = ''
as $$
  select case t
    when 'card_credit'   then 'card_credits'
    when 'protection'    then 'card_protections'
    when 'gift_card'     then 'store_credit_gift_cards'
    when 'store_credit'  then 'store_credit_gift_cards'
    when 'promo'         then 'promos'
    when 'points'        then 'points_miles'
    when 'settlement'    then 'settlements'
    when 'student'       then 'student'
    when 'return_window' then 'returns_trials'
    when 'price_drop'    then 'returns_trials'
    when 'free_trial'    then 'returns_trials'
  end::public.opportunity_category;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table public.cards (
  id            text primary key,                -- stable slug, e.g. 'amex_platinum'
  issuer        text not null,
  product_name  text not null,
  annual_fee    numeric(10, 2) check (annual_fee >= 0), -- null = not verified yet
  status        text not null default 'TODO_VERIFY' check (status in ('active', 'TODO_VERIFY')),
  source_url    text,
  last_verified date,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.card_benefits (
  id                   text primary key,         -- stable slug, e.g. 'amex_platinum_uber_cash'
  card_id              text not null references public.cards (id) on delete cascade,
  type                 public.benefit_type not null,
  name                 text not null,
  amount               numeric(10, 2) check (amount >= 0),  -- per period; null = not verified
  period               public.benefit_period not null,
  period_anchor        public.period_anchor not null default 'calendar',
  -- Optional per-month overrides for monthly credits: {"12": 35} means December is $35.
  amount_schedule      jsonb,
  terms_summary        text,
  max_coverage         numeric(10, 2) check (max_coverage >= 0),
  coverage_window_days int check (coverage_window_days > 0),
  enrollment_required  boolean not null default false,
  -- Phase 3 auto-detection hints, e.g. {"merchants": ["uber", "uber eats"]}.
  merchant_match       jsonb,
  status               text not null default 'TODO_VERIFY' check (status in ('active', 'TODO_VERIFY')),
  source_url           text,
  last_verified        date,
  notes                text,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index card_benefits_card_id_idx on public.card_benefits (card_id);

-- Phase 5: maintained by hand, matched against receipts.
create table public.settlements (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  eligible_merchants  text[] not null default '{}',
  eligible_products   text[] not null default '{}',
  purchase_start      date,
  purchase_end        date,
  claim_deadline      date,
  claim_url           text not null,
  proof_required      text,
  source_url          text,
  last_verified       date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Phase 5: seeded from seed/student_discounts.json.
create table public.student_discounts (
  id            text primary key,
  merchant      text not null,
  title         text not null,
  description   text,
  url           text not null,
  value_note    text,
  source_url    text,
  last_verified date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- User-owned
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text,
  forwarding_address text unique,                -- generated in Phase 2
  is_student         boolean not null default false,
  timezone           text not null default 'UTC',
  onboarded_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.user_cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id    text not null references public.cards (id),
  -- Only the last four digits are ever stored. Never a full card number.
  last_four  char(4) not null check (last_four ~ '^[0-9]{4}$'),
  open_date  date,                               -- needed for cardmember-year benefits
  nickname   text check (char_length(nickname) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, card_id, last_four)
);
create index user_cards_user_id_idx on public.user_cards (user_id);

create table public.benefit_usage (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  user_card_id uuid not null references public.user_cards (id) on delete cascade,
  benefit_id   text not null references public.card_benefits (id) on delete cascade,
  period_start date not null,
  -- null + is_used = "used in full", so the recovered amount follows the catalog
  -- amount even if it is verified after the user marked the credit used.
  amount_used  numeric(10, 2) check (amount_used >= 0),
  is_used      boolean not null default false,
  marked_by    public.usage_marked_by not null default 'user',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_card_id, benefit_id, period_start)
);
create index benefit_usage_user_id_idx on public.benefit_usage (user_id);

create table public.inbound_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  source       public.message_source not null,
  received_at  timestamptz not null default now(),
  parse_status public.parse_status not null default 'pending',
  parse_error  text,
  subject      text,
  from_domain  text,                              -- domain only, not full sender address
  raw_body     text,                              -- purged after parse, and always within 24h
  parsed_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index inbound_messages_user_id_idx on public.inbound_messages (user_id, received_at desc);
create index inbound_messages_pending_idx on public.inbound_messages (parse_status, received_at)
  where parse_status in ('pending', 'failed');

create table public.receipts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  source_message_id    uuid references public.inbound_messages (id) on delete set null,
  merchant             text not null,
  total                numeric(12, 2),
  currency             char(3) not null default 'USD',
  purchase_date        date,
  last_four            char(4) check (last_four ~ '^[0-9]{4}$'),
  items                jsonb not null default '[]',
  category             text,
  matched_user_card_id uuid references public.user_cards (id) on delete set null,
  created_at           timestamptz not null default now()
);
create index receipts_user_id_idx on public.receipts (user_id, purchase_date desc);

create table public.opportunities (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  type              public.opportunity_type not null,
  category          public.opportunity_category generated always as (public.opportunity_category_for(type)) stored,
  title             text not null,
  description       text,
  value_estimate    numeric(12, 2) check (value_estimate >= 0), -- null = unknown / unverified
  expires_at        timestamptz,
  status            public.opportunity_status not null default 'open',
  source_receipt_id uuid references public.receipts (id) on delete set null,
  source_message_id uuid references public.inbound_messages (id) on delete set null,
  -- Card-credit rows: one per (user card, benefit, period).
  user_card_id      uuid references public.user_cards (id) on delete cascade,
  benefit_id        text references public.card_benefits (id) on delete cascade,
  period_start      date,
  action_steps      jsonb not null default '[]',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_card_id, benefit_id, period_start)
);
create index opportunities_user_status_idx on public.opportunities (user_id, status, expires_at);

create table public.recovered (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid unique references public.opportunities (id) on delete cascade,
  amount         numeric(12, 2) not null check (amount >= 0),
  recovered_at   timestamptz not null default now()
);
create index recovered_user_id_idx on public.recovered (user_id, recovered_at desc);

create table public.user_student_claims (
  user_id             uuid not null references auth.users (id) on delete cascade,
  student_discount_id text not null references public.student_discounts (id) on delete cascade,
  claimed_at          timestamptz not null default now(),
  primary key (user_id, student_discount_id)
);

-- Phase 4: revocable per-user tokens for POST /ingest/sms. Only a hash is stored.
create table public.ingest_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index ingest_tokens_user_id_idx on public.ingest_tokens (user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.cards for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.card_benefits for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.settlements for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.student_discounts for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.user_cards for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.benefit_usage for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.opportunities for each row execute function public.set_updated_at();
