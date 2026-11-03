-- Prices behind perk values, and the monthly card check.
--
-- 1. perk_prices: what the same thing costs on its own (a Priority Pass visit, a checked bag, a month of
--    Netflix with ads), each from the provider's own page. A perk points at one price and says how many
--    it includes (10 lounge visits a year); its worth and the sentence explaining it are worked out here,
--    so a price that changes updates every perk that uses it.
-- 2. The monthly card check (scout edge function) re-reads each card's official page and each price page.
--    It records what it found on the card and its perks, adds perks the page states without a dollar
--    amount, updates prices whose new figure is quoted on the page, and queues everything else
--    (changed credit amounts and fees) in catalog_changes for a person to approve.

-- ---------------------------------------------------------------------------
-- Prices
-- ---------------------------------------------------------------------------
create table if not exists public.perk_prices (
  id            text primary key check (id ~ '^[a-z0-9_]+$'),
  label         text not null,                 -- "lounge visit"
  label_plural  text not null,                 -- "lounge visits"
  amount        numeric(10, 2) not null check (amount >= 0),
  currency      char(3) not null default 'USD',
  per           text not null check (per in ('use', 'month', 'year', 'percent')),
  basis         text not null,                 -- "What Priority Pass charges its Standard members for each lounge visit."
  source_url    text not null check (source_url ~ '^https://'),
  last_verified date,
  notes         text,
  -- The monthly check
  evidence      text,                          -- the page's own words for the price
  checked_at    timestamptz,
  check_result  text check (check_result in ('confirmed', 'updated', 'changed', 'not_on_page', 'unreachable')),
  check_note    text,
  sort_order    int not null default 0
);
alter table public.perk_prices enable row level security;
revoke insert, update, delete, truncate on public.perk_prices from anon, authenticated;
drop policy if exists "catalog readable" on public.perk_prices;
create policy "catalog readable" on public.perk_prices for select to authenticated using (true);

alter table public.card_benefits
  add column if not exists worth_price_id text references public.perk_prices (id) on update cascade,
  add column if not exists worth_units numeric(8, 2) check (worth_units is null or worth_units > 0),
  add column if not exists worth_note text,
  -- 'catalog': checked by hand; 'scout': added by the monthly check from the bank's own page.
  add column if not exists origin text not null default 'catalog' check (origin in ('catalog', 'scout')),
  add column if not exists evidence text,
  add column if not exists checked_at timestamptz,
  add column if not exists check_result text check (check_result in ('confirmed', 'not_on_page', 'unreachable'));

-- A no-foreign-fee perk is worth a percent of what you spend abroad.
alter table public.card_benefits drop constraint if exists card_benefits_worth_period_check;
alter table public.card_benefits add constraint card_benefits_worth_period_check check (worth_period in ('year', 'use', 'percent'));

alter table public.cards
  add column if not exists checked_at timestamptz,
  add column if not exists check_result text check (check_result in ('confirmed', 'changed', 'unreachable')),
  add column if not exists check_note text;

-- "$35" on a card in the same currency, "US$35" on a TT$ card.
create or replace function public._money_text(p_amount numeric, p_currency text, p_card_currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (case when p_currency = p_card_currency then '$' when p_currency = 'USD' then 'US$' when p_currency = 'TTD' then 'TT$' else p_currency || ' ' end)
      || (case when p_amount = trunc(p_amount) then to_char(p_amount, 'FM999,999,990') else to_char(p_amount, 'FM999,999,990.00') end);
$$;

-- A perk that points at a price gets its worth, period, explanation and source from it.
create or replace function public._benefit_worth_from_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p public.perk_prices;
  v_card_currency text;
  v_money text;
  v_units numeric;
begin
  if new.worth_price_id is null then
    return new;
  end if;
  select * into p from public.perk_prices where id = new.worth_price_id;
  if not found then
    raise exception 'Unknown price %', new.worth_price_id;
  end if;
  select currency into v_card_currency from public.cards where id = new.card_id;
  v_money := public._money_text(p.amount, p.currency, coalesce(v_card_currency, p.currency));
  v_units := new.worth_units;
  if p.per = 'use' and v_units is null then
    new.worth := p.amount;
    new.worth_period := 'use';
    new.worth_basis := v_money || ' each time. ' || p.basis;
  elsif p.per = 'use' then
    new.worth := p.amount * v_units;
    new.worth_period := 'year';
    new.worth_basis := trim(to_char(v_units, 'FM999990.##')) || ' ' || (case when v_units = 1 then p.label else p.label_plural end) || ' a year × ' || v_money || '. ' || p.basis;
  elsif p.per = 'month' then
    new.worth := p.amount * coalesce(v_units, 12);
    new.worth_period := 'year';
    new.worth_basis := v_money || ' a month × ' || trim(to_char(coalesce(v_units, 12), 'FM999990.##')) || '. ' || p.basis;
  elsif p.per = 'year' then
    new.worth := p.amount * coalesce(v_units, 1);
    new.worth_period := 'year';
    new.worth_basis := v_money || ' a year. ' || p.basis;
  else
    new.worth := p.amount;
    new.worth_period := 'percent';
    new.worth_basis := p.basis;
  end if;
  if new.worth_note is not null then
    new.worth_basis := new.worth_basis || ' ' || new.worth_note;
  end if;
  new.worth_source_url := p.source_url;
  -- A perk with no amount of its own is valued in the price's currency (a US$ lounge visit on a TT$ card).
  if new.amount is null and new.max_coverage is null then
    new.currency := p.currency;
  end if;
  return new;
end;
$$;

drop trigger if exists benefit_worth_from_price on public.card_benefits;
create trigger benefit_worth_from_price
  before insert or update on public.card_benefits
  for each row execute function public._benefit_worth_from_price();

-- A price that changes re-values every perk that uses it.
create or replace function public._price_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.card_benefits set worth_price_id = worth_price_id where worth_price_id = new.id;
  return null;
end;
$$;
revoke execute on function public._price_changed() from public, anon, authenticated;

drop trigger if exists price_changed on public.perk_prices;
create trigger price_changed
  after update of amount, currency, per, basis, source_url, label, label_plural on public.perk_prices
  for each row execute function public._price_changed();

-- ---------------------------------------------------------------------------
-- What the monthly check found that needs a person: changed credit amounts and fees, perks that vanished,
-- prices that moved too far to apply on their own. Never readable by users.
-- ---------------------------------------------------------------------------
create table if not exists public.catalog_changes (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('amount_changed', 'amount_found', 'new_credit', 'new_perk', 'not_on_page', 'fee_changed', 'price_changed', 'price_unconfirmed')),
  card_id     text references public.cards (id) on delete cascade,
  benefit_id  text references public.card_benefits (id) on delete cascade,
  price_id    text references public.perk_prices (id) on delete cascade,
  summary     text not null,                   -- "Airline credit: $100 a year → $150 a year"
  current     jsonb,
  proposed    jsonb,
  evidence    text,
  source_url  text,
  -- review: waiting for a person. applied: done (by the check itself or a person). dismissed: wrong.
  status      text not null default 'review' check (status in ('review', 'applied', 'dismissed')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  -- One open change per thing and proposal, so a monthly re-check doesn't pile up duplicates.
  dedupe_key  text not null
);
create unique index if not exists catalog_changes_open on public.catalog_changes (dedupe_key) where status = 'review';
alter table public.catalog_changes enable row level security;
revoke all on public.catalog_changes from anon, authenticated;
