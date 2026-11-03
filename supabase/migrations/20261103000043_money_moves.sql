-- Money moves: money PerkScan helped you keep that never shows up as a credit or refund.
--   "You already have this": phone insurance you dropped because your card covers it, a rental-car waiver you
--   declined, a store protection plan or trip insurance you cancelled. Plus an annual fee waived or a card
--   switched, a recall refund, a rebate. Each one is a saving you confirm yourself, with the amount you saw;
--   nothing is assumed. A saving that repeats (dropped phone insurance) counts every month until you say it
--   stopped. All of it counts as found by PerkScan: it only exists because PerkScan pointed it out.

create table if not exists public.savings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- One per thing: "phone_insurance:verizon", "annual_fee:<user card id>:2026", "recall:<recall id>".
  key         text not null check (key ~ '^[a-z_]+:[A-Za-z0-9_.:-]{1,120}$'),
  kind        text not null check (kind in ('phone_insurance', 'rental_waiver', 'protection_plan', 'trip_insurance', 'annual_fee', 'recall', 'rebate', 'other')),
  title       text not null check (char_length(title) between 1 and 160),
  amount      numeric(10, 2) not null check (amount > 0 and amount <= 20000),
  currency    char(3) not null default 'USD',
  -- once: a single saving. month / year: saved again every month or year until ended_on.
  per         text not null check (per in ('once', 'month', 'year')),
  started_on  date not null default current_date,
  ended_on    date,
  created_at  timestamptz not null default now(),
  unique (user_id, key)
);
create index if not exists savings_user_idx on public.savings (user_id, started_on desc);
alter table public.savings enable row level security;
revoke insert, update, delete, truncate on public.savings from anon, authenticated;
drop policy if exists "own savings: select" on public.savings;
create policy "own savings: select" on public.savings for select to authenticated using (user_id = (select auth.uid()));

-- Confirm a saving (or correct its amount). Only for yourself.
create or replace function public.confirm_saving(p_key text, p_kind text, p_title text, p_amount numeric, p_currency text, p_per text)
returns public.savings
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.savings;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Bad currency' using errcode = '22023';
  end if;
  insert into public.savings (user_id, key, kind, title, amount, currency, per)
  values (auth.uid(), p_key, p_kind, left(p_title, 160), round(p_amount, 2), p_currency, p_per)
  on conflict (user_id, key) do update set
    kind = excluded.kind, title = excluded.title, amount = excluded.amount, currency = excluded.currency, per = excluded.per, ended_on = null
  returning * into s;
  return s;
end;
$$;
revoke all on function public.confirm_saving(text, text, text, numeric, text, text) from public, anon;
grant execute on function public.confirm_saving(text, text, text, numeric, text, text) to authenticated;

-- A repeating saving that stopped (you started paying again): it stops counting from today. A one-off is removed.
create or replace function public.end_saving(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.savings where user_id = auth.uid() and key = p_key and (per = 'once' or started_on >= current_date);
  update public.savings set ended_on = current_date where user_id = auth.uid() and key = p_key and per <> 'once';
end;
$$;
revoke all on function public.end_saving(text) from public, anon;
grant execute on function public.end_saving(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Product recalls (U.S. Consumer Product Safety Commission), fetched daily by the scout. Public information:
-- the app matches them against your own receipts on your phone.
-- ---------------------------------------------------------------------------
create table if not exists public.product_recalls (
  id             text primary key,             -- CPSC RecallID
  recall_number  text,
  recall_date    date not null,
  title          text not null,
  url            text not null check (url ~ '^https://'),
  products       jsonb not null default '[]',  -- [{ "name": "...", "model": "..." }]
  manufacturers  text[] not null default '{}',
  remedies       text[] not null default '{}', -- "Refund", "Replace", "Repair"
  fetched_at     timestamptz not null default now()
);
create index if not exists product_recalls_date_idx on public.product_recalls (recall_date desc);
alter table public.product_recalls enable row level security;
revoke insert, update, delete, truncate on public.product_recalls from anon, authenticated;
drop policy if exists "recalls readable" on public.product_recalls;
create policy "recalls readable" on public.product_recalls for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- The team's monthly value report, now with confirmed savings: one-offs in the month they happened, repeating
-- ones every month they ran (yearly ones in their month). All of them count as found by PerkScan.
-- ---------------------------------------------------------------------------
create or replace function public._value_report(p_month date, p_plan_price numeric default 9.99)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select date_trunc('month', p_month)::date as s, (date_trunc('month', p_month) + interval '1 month')::date as e
  ),
  people as (
    select p.id from public.profiles p, m where p.onboarded_at is not null and p.onboarded_at < m.e
  ),
  surfaced as (
    select o.user_id, o.type::text as type, o.value_estimate as v
    from public.opportunities o, m
    where o.user_id in (select id from people)
      and o.currency = 'USD'
      and o.value_estimate > 0
      and o.status <> 'dismissed'
      and coalesce(o.period_start, o.created_at::date) >= m.s
      and coalesce(o.period_start, o.created_at::date) < m.e
      and coalesce(o.dedupe_key, '') !~ '^(manual:unconfirmed:|deal:check:|double_charge:)'
      and coalesce(o.dedupe_key, '') !~ '^settlement:[^:]+$'
  ),
  back as (
    select r.user_id, r.amount, r.knew_before, coalesce(o.type::text, 'manual') as type
    from public.recovered r
    left join public.opportunities o on o.id = r.opportunity_id, m
    where r.user_id in (select id from people) and r.currency = 'USD' and r.amount > 0 and r.recovered_at >= m.s and r.recovered_at < m.e
  ),
  saved as (
    select sv.user_id, sv.kind, sv.amount
    from public.savings sv, m
    where sv.user_id in (select id from people) and sv.currency = 'USD' and (
      (sv.per = 'once' and sv.started_on >= m.s and sv.started_on < m.e)
      or (sv.per = 'month' and sv.started_on < m.e and (sv.ended_on is null or sv.ended_on >= m.s))
      or (sv.per = 'year' and sv.started_on < m.e and extract(month from sv.started_on) = extract(month from m.s) and (sv.ended_on is null or sv.ended_on >= m.s))
    )
  ),
  per as (
    select pp.id,
      coalesce((select sum(v) from surfaced s where s.user_id = pp.id), 0) as new_value,
      coalesce((select sum(amount) from back b where b.user_id = pp.id), 0) + coalesce((select sum(amount) from saved x where x.user_id = pp.id), 0) as recovered,
      coalesce((select sum(amount) from back b where b.user_id = pp.id and b.knew_before = false), 0) + coalesce((select sum(amount) from saved x where x.user_id = pp.id), 0) as found
    from people pp
  ),
  stats as (
    select
      count(*) as users,
      count(*) filter (where new_value > 0) as users_with_new_value,
      count(*) filter (where recovered > 0) as users_who_recovered,
      count(*) filter (where found >= p_plan_price) as users_found_at_least_plan,
      count(*) filter (where found >= 3 * p_plan_price) as users_found_at_least_3x_plan,
      round(avg(new_value), 2) as new_mean,
      round(percentile_cont(0.25) within group (order by new_value)::numeric, 2) as new_p25,
      round(percentile_cont(0.5) within group (order by new_value)::numeric, 2) as new_median,
      round(percentile_cont(0.75) within group (order by new_value)::numeric, 2) as new_p75,
      round(avg(recovered), 2) as recovered_mean,
      round(percentile_cont(0.5) within group (order by recovered)::numeric, 2) as recovered_median,
      round(avg(found), 2) as found_mean,
      round(percentile_cont(0.5) within group (order by found)::numeric, 2) as found_median
    from per
  )
  select jsonb_build_object(
    'month', to_char((select s from m), 'YYYY-MM'),
    'plan_price', p_plan_price,
    'users', st.users,
    'users_with_new_value', st.users_with_new_value,
    'users_who_recovered', st.users_who_recovered,
    'users_found_at_least_plan', st.users_found_at_least_plan,
    'users_found_at_least_3x_plan', st.users_found_at_least_3x_plan,
    'new_value', jsonb_build_object('mean', coalesce(st.new_mean, 0), 'p25', coalesce(st.new_p25, 0), 'median', coalesce(st.new_median, 0), 'p75', coalesce(st.new_p75, 0)),
    'recovered', jsonb_build_object('mean', coalesce(st.recovered_mean, 0), 'median', coalesce(st.recovered_median, 0)),
    'found_by_perkscan', jsonb_build_object('mean', coalesce(st.found_mean, 0), 'median', coalesce(st.found_median, 0)),
    'answers', (select jsonb_build_object(
        'found', count(*) filter (where knew_before = false),
        'knew', count(*) filter (where knew_before = true),
        'unanswered', count(*) filter (where knew_before is null)) from back),
    'new_by_type', coalesce((select jsonb_object_agg(type, total) from (select type, round(sum(v), 2) as total from surfaced group by type) t), '{}'::jsonb),
    'found_by_type', coalesce((select jsonb_object_agg(type, total) from (
        select type, round(sum(amount), 2) as total from (
          select type, amount from back where knew_before = false
          union all select 'saved:' || kind, amount from saved
        ) u group by type) t), '{}'::jsonb),
    'other_currency_items', (select count(*) from public.opportunities o, m where o.user_id in (select id from people) and o.currency <> 'USD' and o.value_estimate > 0 and coalesce(o.period_start, o.created_at::date) >= m.s and coalesce(o.period_start, o.created_at::date) < m.e)
  )
  from stats st;
$$;
revoke all on function public._value_report(date, numeric) from public, anon, authenticated;
grant execute on function public._value_report(date, numeric) to service_role;
