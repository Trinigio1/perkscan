-- Phase 3: currencies and countries, receipt matching, and card protections.

-- ---------------------------------------------------------------------------
-- Countries and currencies. Amounts are never converted between currencies:
-- every amount carries its own currency and totals are kept per currency.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column country char(2) check (country ~ '^[A-Z]{2}$'),
  add column home_currency char(3) not null default 'USD' check (home_currency ~ '^[A-Z]{3}$');
grant update (country, home_currency) on public.profiles to authenticated;

alter table public.cards
  add column country char(2) not null default 'US' check (country ~ '^[A-Z]{2}$'),
  add column currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$');

-- Benefits can be stated in a different currency from the card (e.g. US$ coverage on a TT$ card).
alter table public.card_benefits
  add column currency char(3) check (currency ~ '^[A-Z]{3}$');

alter table public.opportunities
  add column currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$');

alter table public.recovered
  add column currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$');

-- What kind of purchase a receipt is (from the parser), used by the matching rules.
alter table public.receipts
  add column purchase_type text,
  add column travel_date date,
  -- Set once a receipt has counted toward a card credit, so re-matching never counts it twice.
  add column credit_opportunity_id uuid references public.opportunities (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Credits carry their currency; recovered money keeps the opportunity's currency.
-- ---------------------------------------------------------------------------
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
           c.product_name, coalesce(b.currency, c.currency) as currency
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
        user_id, type, title, description, value_estimate, currency, expires_at,
        user_card_id, benefit_id, period_start, action_steps
      ) values (
        p_user,
        'card_credit',
        r.name,
        coalesce(r.nickname, r.product_name)
          || coalesce(' · ' || r.terms_summary, ''),
        public.benefit_amount_for_period(r.amount, r.amount_schedule, r.period, v_start),
        r.currency,
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
        currency       = excluded.currency,
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

    insert into public.recovered (user_id, opportunity_id, amount, currency)
    values (auth.uid(), o.id, v_amount, o.currency)
    on conflict (opportunity_id) do update set amount = excluded.amount, currency = excluded.currency, recovered_at = now();

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

create or replace function public.mark_opportunity(
  p_opportunity_id uuid,
  p_action text,                -- 'used' | 'dismiss' | 'reopen'
  p_amount numeric default null -- what it was worth to you, if different from the estimate
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.opportunities;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_action not in ('used', 'dismiss', 'reopen') then
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'Amount cannot be negative' using errcode = '22023';
  end if;

  select * into o from public.opportunities
  where id = p_opportunity_id and user_id = auth.uid() and type <> 'card_credit'
  for update;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;

  if p_action = 'used' then
    if coalesce(p_amount, o.value_estimate, 0) > 0 then
      insert into public.recovered (user_id, opportunity_id, amount, currency)
      values (auth.uid(), o.id, coalesce(p_amount, o.value_estimate), o.currency)
      on conflict (opportunity_id) do update set amount = excluded.amount, currency = excluded.currency, recovered_at = now();
    end if;
    update public.opportunities set status = 'claimed' where id = o.id returning * into o;
  else
    delete from public.recovered where opportunity_id = o.id;
    update public.opportunities
    set status = case
      when p_action = 'dismiss' then 'dismissed'::public.opportunity_status
      when expires_at is not null and expires_at <= now() then 'expired'::public.opportunity_status
      else 'open'::public.opportunity_status
    end
    where id = o.id
    returning * into o;
  end if;
  return o;
end;
$$;


-- ---------------------------------------------------------------------------
-- Auto-mark a card credit as used from a matched receipt (server only).
-- Never overrides something the user marked themselves.
-- ---------------------------------------------------------------------------
create or replace function public._auto_mark_credit_used(p_opportunity_id uuid, p_amount numeric)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  o       public.opportunities;
  v_prev  public.benefit_usage;
  v_total numeric;
  v_full  boolean;
begin
  select * into o from public.opportunities
  where id = p_opportunity_id and type = 'card_credit' and status = 'open'
  for update;
  if not found or p_amount is null or p_amount <= 0 then
    return false;
  end if;

  select * into v_prev from public.benefit_usage
  where user_card_id = o.user_card_id and benefit_id = o.benefit_id and period_start = o.period_start;
  if found and v_prev.marked_by = 'user' then
    return false;
  end if;

  v_total := coalesce(v_prev.amount_used, 0) + p_amount;
  if o.value_estimate is not null then
    v_total := least(v_total, o.value_estimate);
  end if;
  v_full := o.value_estimate is not null and v_total >= o.value_estimate;

  insert into public.benefit_usage (user_id, user_card_id, benefit_id, period_start, amount_used, is_used, marked_by)
  values (o.user_id, o.user_card_id, o.benefit_id, o.period_start, v_total, v_full, 'auto')
  on conflict (user_card_id, benefit_id, period_start) do update set
    amount_used = excluded.amount_used, is_used = excluded.is_used, marked_by = 'auto';

  insert into public.recovered (user_id, opportunity_id, amount, currency)
  values (o.user_id, o.id, v_total, o.currency)
  on conflict (opportunity_id) do update set amount = excluded.amount, currency = excluded.currency, recovered_at = now();

  if v_full then
    update public.opportunities set status = 'claimed' where id = o.id;
  end if;
  return true;
end;
$$;

revoke execute on function public._auto_mark_credit_used(uuid, numeric) from public, anon, authenticated;
grant execute on function public._auto_mark_credit_used(uuid, numeric) to service_role;
