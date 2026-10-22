-- Phase 5: student offers and class-action settlements.

-- Phase 1 created empty placeholder tables (settlements, student_discounts,
-- user_student_claims). They were never filled or used; replace them with the shapes
-- Phase 5 needs. Refuse if any of them has rows.
do $$
begin
  if exists (select 1 from public.settlements) or exists (select 1 from public.student_discounts)
     or exists (select 1 from public.user_student_claims) then
    raise exception 'A Phase 1 placeholder table has data; migrate it by hand before replacing it';
  end if;
end;
$$;
drop table public.user_student_claims;
drop table public.settlements;
drop table public.student_discounts;

-- ---------------------------------------------------------------------------
-- Student offers: a curated catalog (seed/student_discounts.json), readable by
-- signed-in users. Users mark which ones they've claimed.
-- ---------------------------------------------------------------------------
create table public.student_offers (
  id            text primary key,
  name          text not null,
  provider      text not null,
  category      text not null,
  summary       text not null,
  eligibility   text not null,
  how_to_verify text not null,
  url           text not null check (url like 'https://%'),
  countries     text[] not null default '{}',  -- empty = worldwide
  status        text not null default 'TODO_VERIFY' check (status in ('active', 'TODO_VERIFY')),
  source_url    text,
  last_verified date,
  sort_order    int not null default 0
);
alter table public.student_offers enable row level security;
revoke all on public.student_offers from anon;
revoke insert, update, delete, truncate on public.student_offers from authenticated;
grant select on public.student_offers to authenticated;
create policy "student offers: read" on public.student_offers for select to authenticated using (true);

create table public.student_offer_claims (
  user_id    uuid not null references auth.users (id) on delete cascade,
  offer_id   text not null references public.student_offers (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (user_id, offer_id)
);
alter table public.student_offer_claims enable row level security;
revoke all on public.student_offer_claims from anon;
revoke update, truncate on public.student_offer_claims from authenticated;
grant select, insert, delete on public.student_offer_claims to authenticated;
create policy "own claims: select" on public.student_offer_claims for select to authenticated using (user_id = (select auth.uid()));
create policy "own claims: insert" on public.student_offer_claims for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own claims: delete" on public.student_offer_claims for delete to authenticated using (user_id = (select auth.uid()));
alter table public.student_offer_claims alter column user_id set default auth.uid();

-- ---------------------------------------------------------------------------
-- Settlements: maintained by PerkScan (seed/settlements.json or the table editor),
-- never by users. Matched against each user's receipts by store and purchase date.
-- ---------------------------------------------------------------------------
create table public.settlements (
  id                 text primary key,
  name               text not null,
  description        text not null,
  eligible_merchants text[] not null check (cardinality(eligible_merchants) > 0),  -- lowercase; matched by "contains"
  eligible_products  text not null,
  purchase_start     date not null,
  purchase_end       date not null check (purchase_end >= purchase_start),
  claim_deadline     date not null,
  claim_url          text not null check (claim_url like 'https://%'),   -- the official claim site only
  proof_required     text not null,
  eligible_countries text[] not null default '{}',                       -- empty = any country
  payout_note        text,
  status             text not null default 'active' check (status in ('active', 'closed')),
  source_url         text not null check (source_url like 'https://%'),
  last_verified      date not null,
  created_at         timestamptz not null default now()
);
alter table public.settlements enable row level security;
revoke all on public.settlements from anon;
revoke insert, update, delete, truncate on public.settlements from authenticated;
grant select on public.settlements to authenticated;
create policy "settlements: read" on public.settlements for select to authenticated using (true);

-- One "possible claim" per user per settlement, from their most recent matching purchase.
create function public._match_settlements_for_user(p_user uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_country  text;
  v_currency text;
  n          int := 0;
  s          public.settlements;
  r          public.receipts;
begin
  select country, home_currency into v_country, v_currency from public.profiles where id = p_user;

  for s in select * from public.settlements where status = 'active' and claim_deadline >= current_date loop
    -- Outside the class's countries: skip. Unknown country: show it, and the steps say to check.
    if cardinality(s.eligible_countries) > 0 and v_country is not null and not (v_country = any (s.eligible_countries)) then
      continue;
    end if;

    select * into r from public.receipts
    where user_id = p_user
      and purchase_date between s.purchase_start and s.purchase_end
      and exists (select 1 from unnest(s.eligible_merchants) m where lower(merchant) like '%' || m || '%')
    order by purchase_date desc
    limit 1;
    if not found then continue; end if;

    insert into public.opportunities (user_id, type, title, description, merchant, value_estimate, currency, expires_at,
                                      dedupe_key, source_receipt_id, action_steps)
    values (
      p_user, 'settlement',
      'Possible claim: ' || s.name,
      concat_ws(' ',
        format('You bought from %s on %s, within this settlement''s purchase dates (%s to %s).', r.merchant, r.purchase_date, s.purchase_start, s.purchase_end),
        s.description,
        s.payout_note),
      r.merchant,
      null,  -- payouts depend on the number of claims; never counted as money owed
      coalesce(v_currency, 'USD'),
      (s.claim_deadline::text || 'T23:59:59Z')::timestamptz,
      'settlement:' || s.id,
      r.id,
      jsonb_build_array(
        jsonb_build_object('step', 'Check you qualify: ' || s.eligible_products ||
          case when cardinality(s.eligible_countries) > 0 then ' Open to people in: ' || array_to_string(s.eligible_countries, ', ') || '.' else '' end),
        jsonb_build_object('step', 'Proof you may need: ' || s.proof_required),
        jsonb_build_object('step', 'File on the official settlement site before ' || s.claim_deadline || '. PerkScan never files for you.', 'url', s.claim_url),
        jsonb_build_object('step', 'Settlement details', 'url', s.source_url)
      )
    )
    on conflict (user_id, dedupe_key) where dedupe_key is not null do update set
      title = excluded.title,
      description = excluded.description,
      expires_at = excluded.expires_at,
      action_steps = excluded.action_steps
    where public.opportunities.status = 'open';
    n := n + 1;
  end loop;

  -- Settlements that closed early: their open matches expire.
  update public.opportunities o set status = 'expired'
  from public.settlements closed
  where o.user_id = p_user and o.status = 'open' and o.dedupe_key = 'settlement:' || closed.id and closed.status = 'closed';
  return n;
end;
$$;
revoke all on function public._match_settlements_for_user(uuid) from public, anon, authenticated;
-- The inbox pipeline (service role) runs it right after a new receipt arrives.
grant execute on function public._match_settlements_for_user(uuid) to service_role;

create function public._match_all_settlements()
returns void
language sql
security definer
set search_path = ''
as $$
  select public._match_settlements_for_user(u.user_id)
  from (select distinct user_id from public.receipts) u;
$$;
revoke all on function public._match_all_settlements() from public, anon, authenticated;

-- App-callable on load, after new receipts arrive.
create function public.sync_my_settlements()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return public._match_settlements_for_user(auth.uid());
end;
$$;
revoke all on function public.sync_my_settlements() from public, anon;
grant execute on function public.sync_my_settlements() to authenticated;

select cron.schedule('perkscan-match-settlements', '37 * * * *', $$select public._match_all_settlements()$$);
