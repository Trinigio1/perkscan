-- Credit periods, opportunity sync, and the RPCs the app calls.

-- ---------------------------------------------------------------------------
-- Signup: every auth user gets a profile row.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reject time zones Postgres doesn't know, so period math can't fail later.
create or replace function public.validate_profile_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.validate_profile_timezone();

-- ---------------------------------------------------------------------------
-- Period math
-- ---------------------------------------------------------------------------
-- Returns the benefit period containing local date p_at as [period_start, period_end).
-- Calendar periods start on Jan 1 / Apr 1 / Jul 1 / Oct 1 / the 1st of the month.
-- Cardmember-year periods repeat every N months from the card's open date; when
-- the open date is unknown they fall back to calendar periods.
-- Month arithmetic clamps to month end (Jan 31 + 1 month = Feb 28/29), always
-- computed from the original anchor so later periods don't drift.
create or replace function public.benefit_period_bounds(
  p_period public.benefit_period,
  p_anchor public.period_anchor,
  p_open_date date,
  p_at date,
  out period_start date,
  out period_end date
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_months int;
  v_base   date;
  v_k      int;
begin
  if p_period = 'per_claim' or p_at is null then
    return;
  end if;

  v_months := case p_period
    when 'monthly' then 1
    when 'quarterly' then 3
    when 'semiannual' then 6
    when 'annual' then 12
  end;

  if p_anchor = 'cardmember_year' and p_open_date is not null then
    v_base := p_open_date;
  else
    v_base := date '2000-01-01';
  end if;

  v_k := floor(
    ((extract(year from p_at) - extract(year from v_base)) * 12
      + (extract(month from p_at) - extract(month from v_base)))::numeric / v_months
  );

  -- Correct for day-of-month: the estimate can be one period off either way.
  while (v_base + make_interval(months => v_k * v_months))::date > p_at loop
    v_k := v_k - 1;
  end loop;
  while (v_base + make_interval(months => (v_k + 1) * v_months))::date <= p_at loop
    v_k := v_k + 1;
  end loop;

  period_start := (v_base + make_interval(months => v_k * v_months))::date;
  period_end   := (v_base + make_interval(months => (v_k + 1) * v_months))::date;
end;
$$;

-- Amount of a credit for a given period, honoring monthly overrides.
create or replace function public.benefit_amount_for_period(
  p_amount numeric,
  p_schedule jsonb,
  p_period public.benefit_period,
  p_period_start date
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_period = 'monthly'
      and p_schedule ? extract(month from p_period_start)::int::text
      then (p_schedule ->> extract(month from p_period_start)::int::text)::numeric
    else p_amount
  end;
$$;

-- ---------------------------------------------------------------------------
-- Card-credit opportunities
-- ---------------------------------------------------------------------------
-- Creates one opportunity per (user card, credit benefit, period) from the period
-- the card was added through today, refreshes amounts from the catalog, keeps
-- recovered amounts in sync for credits marked "used in full", and expires
-- anything past its deadline. Never backfills periods before the card was added:
-- we don't know whether those were used.
create or replace function public._sync_card_credits_for_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_today  date;
  r        record;
  v_cursor date;
  v_start  date;
  v_end    date;
begin
  select coalesce(p.timezone, 'UTC') into v_tz from public.profiles p where p.id = p_user;
  v_tz := coalesce(v_tz, 'UTC');
  v_today := (now() at time zone v_tz)::date;

  for r in
    select uc.id as user_card_id, uc.open_date, uc.created_at as added_at, uc.nickname,
           b.id as benefit_id, b.name, b.amount, b.amount_schedule, b.period, b.period_anchor,
           b.terms_summary, b.enrollment_required, b.source_url,
           c.product_name
    from public.user_cards uc
    join public.card_benefits b on b.card_id = uc.card_id and b.type = 'credit' and b.period <> 'per_claim'
    join public.cards c on c.id = uc.card_id
    where uc.user_id = p_user
  loop
    v_cursor := (r.added_at at time zone v_tz)::date;
    loop
      select pb.period_start, pb.period_end into v_start, v_end
      from public.benefit_period_bounds(r.period, r.period_anchor, r.open_date, v_cursor) pb;
      exit when v_start is null or v_start > v_today;

      insert into public.opportunities as o (
        user_id, type, title, description, value_estimate, expires_at,
        user_card_id, benefit_id, period_start, action_steps
      ) values (
        p_user,
        'card_credit',
        r.name,
        coalesce(r.nickname, r.product_name)
          || coalesce(' · ' || r.terms_summary, ''),
        public.benefit_amount_for_period(r.amount, r.amount_schedule, r.period, v_start),
        (v_end::timestamp at time zone v_tz),
        r.user_card_id,
        r.benefit_id,
        v_start,
        jsonb_build_array(
          jsonb_build_object('step', case when r.enrollment_required
            then 'Make sure the benefit is enrolled/activated in your card issuer''s app.'
            else 'Check the benefit terms in your card issuer''s app.' end),
          jsonb_build_object('step', 'Use the credit before it resets, then mark it used here.')
        ) || case when r.source_url is not null
          then jsonb_build_array(jsonb_build_object('step', 'Issuer terms', 'url', r.source_url))
          else '[]'::jsonb end
      )
      on conflict (user_card_id, benefit_id, period_start) do update set
        title          = excluded.title,
        description    = excluded.description,
        value_estimate = excluded.value_estimate,
        expires_at     = excluded.expires_at,
        action_steps   = excluded.action_steps;

      v_cursor := v_end;
    end loop;
  end loop;

  -- "Used in full" follows the (possibly newly verified) catalog amount.
  update public.recovered rv
  set amount = o.value_estimate
  from public.opportunities o
  join public.benefit_usage u
    on u.user_card_id = o.user_card_id and u.benefit_id = o.benefit_id and u.period_start = o.period_start
  where rv.opportunity_id = o.id
    and o.user_id = p_user
    and u.is_used and u.amount_used is null
    and o.value_estimate is not null
    and rv.amount <> o.value_estimate;

  update public.opportunities
  set status = 'expired'
  where user_id = p_user and status = 'open' and expires_at is not null and expires_at <= now();
end;
$$;

-- App-callable: sync the signed-in user's credits (called on app open).
create or replace function public.sync_my_card_credits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public._sync_card_credits_for_user(auth.uid());
end;
$$;

-- Nightly: every user with cards, plus expiry for everything else.
create or replace function public._sync_all_card_credits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in select distinct user_id from public.user_cards loop
    perform public._sync_card_credits_for_user(v_user);
  end loop;

  update public.opportunities
  set status = 'expired'
  where status = 'open' and expires_at is not null and expires_at <= now();
end;
$$;

-- Keep opportunities in step with the wallet. If the open date changes, periods
-- move, so unused rows computed from the old date are rebuilt.
create or replace function public._user_cards_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.open_date is distinct from old.open_date then
    delete from public.opportunities o
    where o.user_card_id = new.id
      and o.type = 'card_credit'
      and not exists (
        select 1 from public.benefit_usage u
        where u.user_card_id = o.user_card_id and u.benefit_id = o.benefit_id and u.period_start = o.period_start
      );
  end if;
  perform public._sync_card_credits_for_user(new.user_id);
  return null;
end;
$$;

create trigger user_cards_after_change
  after insert or update of open_date, card_id on public.user_cards
  for each row execute function public._user_cards_after_change();

-- ---------------------------------------------------------------------------
-- Mark a card credit used / partly used / unused.
--   p_is_used = true,  p_amount_used = null -> used in full
--   p_is_used = true,  p_amount_used = x    -> used, x dollars
--   p_is_used = false, p_amount_used = x>0  -> partly used, stays open
--   p_is_used = false, p_amount_used = null/0 -> reset to unused
-- ---------------------------------------------------------------------------
create or replace function public.mark_credit_used(
  p_opportunity_id uuid,
  p_is_used boolean,
  p_amount_used numeric default null
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  o         public.opportunities;
  v_reset   boolean;
  v_amount  numeric;
  v_claimed boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_amount_used is not null and p_amount_used < 0 then
    raise exception 'Amount cannot be negative' using errcode = '22023';
  end if;

  select * into o from public.opportunities
  where id = p_opportunity_id and user_id = auth.uid() and type = 'card_credit'
  for update;
  if not found then
    raise exception 'Credit not found' using errcode = 'P0002';
  end if;

  v_reset := not p_is_used and coalesce(p_amount_used, 0) = 0;

  if v_reset then
    delete from public.benefit_usage
    where user_card_id = o.user_card_id and benefit_id = o.benefit_id and period_start = o.period_start;
    delete from public.recovered where opportunity_id = o.id;
    v_claimed := false;
  else
    insert into public.benefit_usage (user_id, user_card_id, benefit_id, period_start, amount_used, is_used, marked_by)
    values (auth.uid(), o.user_card_id, o.benefit_id, o.period_start,
            case when p_is_used and p_amount_used is null then null else p_amount_used end,
            p_is_used, 'user')
    on conflict (user_card_id, benefit_id, period_start) do update set
      amount_used = excluded.amount_used,
      is_used     = excluded.is_used,
      marked_by   = 'user';

    v_amount := case
      when p_amount_used is null then coalesce(o.value_estimate, 0)
      when o.value_estimate is not null then least(p_amount_used, o.value_estimate)
      else p_amount_used
    end;

    insert into public.recovered (user_id, opportunity_id, amount)
    values (auth.uid(), o.id, v_amount)
    on conflict (opportunity_id) do update set amount = excluded.amount, recovered_at = now();

    v_claimed := p_is_used or (o.value_estimate is not null and p_amount_used >= o.value_estimate);
  end if;

  update public.opportunities
  set status = case
    when v_claimed then 'claimed'::public.opportunity_status
    when expires_at is not null and expires_at <= now() then 'expired'::public.opportunity_status
    else 'open'::public.opportunity_status
  end
  where id = o.id
  returning * into o;

  return o;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privacy: raw email/SMS bodies never live longer than 24 hours.
-- ---------------------------------------------------------------------------
create or replace function public._purge_raw_bodies()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.inbound_messages
  set raw_body = null
  where raw_body is not null and received_at < now() - interval '24 hours';
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: internal helpers are not callable from the app.
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_profile_timezone() from public, anon, authenticated;
revoke execute on function public._sync_card_credits_for_user(uuid) from public, anon, authenticated;
revoke execute on function public._sync_all_card_credits() from public, anon, authenticated;
revoke execute on function public._user_cards_after_change() from public, anon, authenticated;
revoke execute on function public._purge_raw_bodies() from public, anon, authenticated;

revoke execute on function public.sync_my_card_credits() from public, anon;
revoke execute on function public.mark_credit_used(uuid, boolean, numeric) from public, anon;
grant execute on function public.sync_my_card_credits() to authenticated;
grant execute on function public.mark_credit_used(uuid, boolean, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Schedules (UTC)
-- ---------------------------------------------------------------------------
select cron.schedule('perkscan-sync-card-credits', '17 * * * *', $$select public._sync_all_card_credits()$$);
select cron.schedule('perkscan-purge-raw-bodies', '7 * * * *', $$select public._purge_raw_bodies()$$);
