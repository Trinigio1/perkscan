-- Earn rates: what each card earns where, from the issuer's own page, so "Before you pay" can say which
-- card earns most and the bank scan can show what the wrong card cost. Catalog data: readable by
-- signed-in users, written only by catalog migrations.
create table if not exists public.card_rewards (
  card_id          text primary key references public.cards (id) on delete cascade,
  kind             text not null check (kind in ('cash', 'points', 'miles')),
  -- Only when the issuer states a cash value; otherwise points stay points, never dollars.
  cents_per_unit   numeric(5, 2) check (cents_per_unit is null or (kind <> 'cash' and cents_per_unit > 0)),
  value_basis      text,
  value_source_url text check (value_source_url is null or value_source_url like 'https://%'),
  note             text,
  last_verified    date not null,
  check (cents_per_unit is null or (value_basis is not null and value_source_url is not null))
);

create table if not exists public.card_earn_rates (
  id            bigint generated always as identity primary key,
  card_id       text not null references public.cards (id) on delete cascade,
  category      text not null check (category in ('everything', 'dining', 'groceries', 'online_groceries', 'gas', 'transit', 'streaming', 'drugstores', 'travel', 'flights', 'hotels', 'online_retail', 'entertainment', 'merchant', 'portal', 'portal_hotels', 'choice', 'rotating', 'top_category')),
  rate          numeric(5, 2) not null check (rate > 0 and rate <= 20),
  merchants     text[] not null default '{}',
  cap           numeric(10, 2) check (cap is null or cap > 0),
  cap_period    text check (cap_period in ('month', 'quarter', 'year', 'billing_cycle')),
  needs         text,
  note          text,
  source_url    text not null check (source_url like 'https://%'),
  last_verified date not null,
  sort_order    int not null default 0,
  check ((cap is null) = (cap_period is null))
);
create index if not exists card_earn_rates_card_idx on public.card_earn_rates (card_id);

alter table public.card_rewards enable row level security;
alter table public.card_earn_rates enable row level security;
revoke all on public.card_rewards, public.card_earn_rates from anon, authenticated;
grant select on public.card_rewards, public.card_earn_rates to authenticated;
drop policy if exists "card rewards: read" on public.card_rewards;
drop policy if exists "card earn rates: read" on public.card_earn_rates;
create policy "card rewards: read" on public.card_rewards for select to authenticated using (true);
create policy "card earn rates: read" on public.card_earn_rates for select to authenticated using (true);
