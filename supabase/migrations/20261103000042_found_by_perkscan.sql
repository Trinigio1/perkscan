-- Proof that PerkScan is worth it: of the money you got back, how much you didn't know about before
-- PerkScan. Asked once per recovery ("PerkScan found it" / "I already knew"); nothing is assumed, so an
-- unanswered recovery never counts as PerkScan's.
alter table public.recovered
  add column if not exists knew_before boolean,           -- null: not asked or not answered yet
  add column if not exists answered_at timestamptz;

create or replace function public.answer_knew_before(p_recovered_id uuid, p_knew boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.recovered
  set knew_before = p_knew, answered_at = now()
  where id = p_recovered_id and user_id = auth.uid();
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.answer_knew_before(uuid, boolean) from public, anon;
grant execute on function public.answer_knew_before(uuid, boolean) to authenticated;

-- The user's plan. Only the server sets it (billing), never the app.
alter table public.profiles
  add column if not exists plan text not null default 'free' check (plan in ('free', 'plus'));

-- ---------------------------------------------------------------------------
-- The monthly value report, for the team: aggregates only, never one person's data.
--   new value:  money that became usable this month, with a stated or clearly read amount (credits that
--               reset, refunds and price drops owed, offers with an amount), never guesses
--   recovered:  what people marked used or PerkScan saw used on a receipt
--   found:      recovered money the person said they didn't know about before PerkScan
-- Amounts in US dollars only (other currencies are counted, not converted).
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
      -- Not guesses: unconfirmed reminders, unsure deals, possible double charges, catalog settlement matches.
      and coalesce(o.dedupe_key, '') !~ '^(manual:unconfirmed:|deal:check:|double_charge:)'
      and coalesce(o.dedupe_key, '') !~ '^settlement:[^:]+$'
  ),
  back as (
    select r.user_id, r.amount, r.knew_before, coalesce(o.type::text, 'manual') as type
    from public.recovered r
    left join public.opportunities o on o.id = r.opportunity_id, m
    where r.user_id in (select id from people) and r.currency = 'USD' and r.amount > 0 and r.recovered_at >= m.s and r.recovered_at < m.e
  ),
  per as (
    select pp.id,
      coalesce((select sum(v) from surfaced s where s.user_id = pp.id), 0) as new_value,
      coalesce((select sum(amount) from back b where b.user_id = pp.id), 0) as recovered,
      coalesce((select sum(amount) from back b where b.user_id = pp.id and b.knew_before = false), 0) as found
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
    'found_by_type', coalesce((select jsonb_object_agg(type, total) from (select type, round(sum(amount), 2) as total from back where knew_before = false group by type) t), '{}'::jsonb),
    'other_currency_items', (select count(*) from public.opportunities o, m where o.user_id in (select id from people) and o.currency <> 'USD' and o.value_estimate > 0 and coalesce(o.period_start, o.created_at::date) >= m.s and coalesce(o.period_start, o.created_at::date) < m.e)
  )
  from stats st;
$$;
revoke all on function public._value_report(date, numeric) from public, anon, authenticated;
grant execute on function public._value_report(date, numeric) to service_role;
