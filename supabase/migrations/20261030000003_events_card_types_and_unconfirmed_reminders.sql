-- Promotions for one card type within a bank (e.g. Scotiabank's Mastercard-only Divali cash back),
-- and reminders for events that haven't been announced yet.

alter table public.local_events add column card_keywords text[] not null default '{}';

-- add_my_item gains p_unconfirmed: such items stay "Check" in the app until the event is announced.
drop function if exists public.add_my_item(text, text, text, numeric, text, date, text, text);
create or replace function public.add_my_item(
  p_type text,
  p_title text,
  p_merchant text default null,
  p_amount numeric default null,
  p_currency text default null,
  p_expires_on date default null,
  p_program_id text default null,
  p_note text default null,
  p_unconfirmed boolean default false
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
    case when p_unconfirmed then 'Reminder — not announced yet' else 'Added by you' end,
    nullif(left(trim(p_merchant), 80), ''),
    -- Points have no reliable cash value; only money amounts count toward totals.
    case when p_type = 'points' then null else round(p_amount, 2) end,
    v_currency,
    case when p_expires_on is null then null else (p_expires_on + time '23:59:59') at time zone 'UTC' end,
    v_steps,
    case when p_unconfirmed then 'manual:unconfirmed:' else 'manual:' end || gen_random_uuid()
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_my_item(text, text, text, numeric, text, date, text, text, boolean) from public, anon;
grant execute on function public.add_my_item(text, text, text, numeric, text, date, text, text, boolean) to authenticated;
