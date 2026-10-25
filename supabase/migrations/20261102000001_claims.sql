-- Claiming made easy: PerkScan drafts the request and the user sends it themselves. It records
-- when they started, then asks a few days later whether the money arrived — so the recovered
-- total is money that actually came back, not estimates.

alter table public.opportunities
  add column claim_started_at timestamptz,
  -- When to ask "Did it arrive?"; pushed back when the user says "not yet".
  add column claim_check_after timestamptz;

/** Days to wait before asking whether a claim paid out. */
create function public._claim_check_days() returns int language sql immutable set search_path = '' as $$ select 4 $$;

/** The user sent a request or filed a claim: remember when, and when to check in. */
create function public.start_claim(p_opportunity_id uuid) returns public.opportunities
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
  update public.opportunities
  set claim_started_at = coalesce(claim_started_at, now()),
      claim_check_after = coalesce(claim_check_after, now() + make_interval(days => public._claim_check_days()))
  where id = p_opportunity_id and user_id = auth.uid() and status = 'open'
  returning * into o;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return o;
end;
$$;

/** "Not yet": ask again in a few days. */
create function public.snooze_claim_check(p_opportunity_id uuid) returns public.opportunities
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
  update public.opportunities
  set claim_check_after = now() + make_interval(days => public._claim_check_days())
  where id = p_opportunity_id and user_id = auth.uid() and claim_started_at is not null and status = 'open'
  returning * into o;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return o;
end;
$$;

revoke all on function public.start_claim(uuid) from public, anon;
revoke all on function public.snooze_claim_check(uuid) from public, anon;
grant execute on function public.start_claim(uuid) to authenticated;
grant execute on function public.snooze_claim_check(uuid) to authenticated;
