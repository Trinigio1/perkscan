-- Hidden money: the programs catalog (loyalty, store price adjustments, unclaimed money,
-- library perks, refund rules, deadlines), and adding your own items by hand.

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
    when 'refund'        then 'refunds'
    when 'benefit'       then 'benefits'
  end::public.opportunity_category;
$$;

-- ---------------------------------------------------------------------------
-- Programs catalog (seed/programs.json): maintained by PerkScan, readable by signed-in users.
-- ---------------------------------------------------------------------------
create table public.perk_programs (
  id            text primary key,
  kind          text not null check (kind in ('loyalty', 'price_adjust', 'unclaimed', 'library', 'refund_rule', 'deadline_rule')),
  name          text not null,
  provider      text not null,
  countries     text[] not null default '{}',  -- empty = anywhere
  summary       text not null,
  how_to        text not null,
  url           text not null check (url like 'https://%'),
  merchants     text[] not null default '{}',  -- lowercase store names, for matching receipts
  window_days   int check (window_days between 1 and 365),
  status        text not null default 'TODO_VERIFY' check (status in ('active', 'TODO_VERIFY')),
  source_url    text,
  last_verified date,
  sort_order    int not null default 0,
  check (status <> 'active' or (source_url is not null and last_verified is not null))
);
alter table public.perk_programs enable row level security;
revoke all on public.perk_programs from anon;
revoke insert, update, delete, truncate on public.perk_programs from authenticated;
grant select on public.perk_programs to authenticated;
create policy "perk programs: read" on public.perk_programs for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Add your own: points balances, gift cards, allowances, refunds you're owed.
-- Users can't insert opportunities directly; this checks every field instead.
-- ---------------------------------------------------------------------------
create or replace function public.add_my_item(
  p_type text,
  p_title text,
  p_merchant text default null,
  p_amount numeric default null,
  p_currency text default null,
  p_expires_on date default null,
  p_program_id text default null,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_currency text;
  v_steps jsonb := '[]'::jsonb;
  v_program public.perk_programs;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_type not in ('points', 'gift_card', 'store_credit', 'promo', 'benefit', 'refund') then
    raise exception 'Unsupported type %', p_type using errcode = '22023';
  end if;
  if coalesce(length(trim(p_title)), 0) not between 1 and 100 then
    raise exception 'Give it a short name' using errcode = '22023';
  end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 1000000) then
    raise exception 'Amount out of range' using errcode = '22023';
  end if;
  if p_expires_on is not null and p_expires_on < current_date - 1 then
    raise exception 'That date has already passed' using errcode = '22023';
  end if;
  if (select count(*) from public.opportunities where user_id = v_user and dedupe_key like 'manual:%') >= 500 then
    raise exception 'Too many items added by hand' using errcode = '54000';
  end if;

  v_currency := coalesce(upper(p_currency), (select home_currency from public.profiles where id = v_user), 'USD');
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Use a 3-letter currency code' using errcode = '22023';
  end if;

  if p_program_id is not null then
    select * into v_program from public.perk_programs where id = p_program_id;
    if not found then
      raise exception 'Unknown program' using errcode = '22023';
    end if;
    v_steps := jsonb_build_array(jsonb_build_object('step', v_program.how_to), jsonb_build_object('step', v_program.name || ' terms', 'url', v_program.url));
  end if;
  if nullif(trim(p_note), '') is not null then
    v_steps := jsonb_build_array(jsonb_build_object('step', left(trim(p_note), 300))) || v_steps;
  end if;

  insert into public.opportunities (user_id, type, title, description, merchant, value_estimate, currency, expires_at, action_steps, dedupe_key)
  values (
    v_user,
    p_type::public.opportunity_type,
    left(trim(p_title), 100),
    'Added by you',
    nullif(left(trim(p_merchant), 80), ''),
    -- Points have no reliable cash value; only money amounts count toward totals.
    case when p_type = 'points' then null else round(p_amount, 2) end,
    v_currency,
    case when p_expires_on is null then null else (p_expires_on + time '23:59:59') at time zone 'UTC' end,
    v_steps,
    'manual:' || gen_random_uuid()
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_my_item(text, text, text, numeric, text, date, text, text) from public, anon;
grant execute on function public.add_my_item(text, text, text, numeric, text, date, text, text) to authenticated;

-- Deletes an item the user added by hand (anything else can only be dismissed).
create or replace function public.remove_my_item(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.opportunities where id = p_id and user_id = auth.uid() and dedupe_key like 'manual:%';
$$;
revoke all on function public.remove_my_item(uuid) from public, anon;
grant execute on function public.remove_my_item(uuid) to authenticated;
