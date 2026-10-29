-- Perk scout: free perk programs found automatically, for every user's stores.
-- Stores people buy from that the catalog has no perk for are looked up on their official site; a
-- free-to-join rewards program found there is published with the quotes it rests on. Anything that
-- states a dollar amount waits for a person to approve it first. Only counts ever leave a user's rows.

-- Where a catalog entry came from, and the page quotes a scouted one rests on.
alter table public.perk_programs add column if not exists origin text not null default 'catalog';
alter table public.perk_programs drop constraint if exists perk_programs_origin_check;
alter table public.perk_programs add constraint perk_programs_origin_check check (origin in ('catalog', 'scout'));
alter table public.perk_programs add column if not exists evidence text;

-- Found with a dollar amount: held here until approved. Service role only.
create table if not exists public.perk_candidates (
  id          text primary key,
  country     text not null,
  store_key   text not null,
  name        text not null,
  provider    text not null,
  summary     text not null,
  how_to      text not null,
  url         text not null check (url like 'https://%'),
  evidence    text not null,
  merchants   text[] not null default '{}',
  interests   text[] not null default '{}',
  status      text not null default 'review' check (status in ('review', 'approved', 'rejected')),
  found_at    timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.perk_candidates enable row level security;
revoke all on public.perk_candidates from anon, authenticated;

-- Which stores were looked up, so each is read at most monthly. Service role only.
create table if not exists public.perk_store_checks (
  store_key  text not null,
  country    text not null,
  domain     text,
  result     text not null,
  checked_at timestamptz not null default now(),
  primary key (store_key, country)
);
alter table public.perk_store_checks enable row level security;
revoke all on public.perk_store_checks from anon, authenticated;

-- Stores bought from in the last year with no perk program in the catalog, with how many people buy
-- there (a count, never who). The scout looks up stores 2+ people use, or well-known chains.
create or replace function public._perk_store_candidates(p_limit int default 20)
returns table (country text, store_key text, name text, domain text, users int)
language sql
stable
security definer
set search_path = ''
as $$
  with bought as (
    select p.country, r.user_id, public.store_key(r.merchant) as store_key, r.merchant, m.from_domain
    from public.receipts r
    join public.profiles p on p.id = r.user_id
    left join public.inbound_messages m on m.id = r.source_message_id
    where p.country is not null and r.kind = 'receipt' and r.purchase_date > (now() - interval '365 days')::date
  ),
  stores as (
    select b.country, b.store_key, mode() within group (order by b.merchant) as name,
           mode() within group (order by b.from_domain) as domain, count(distinct b.user_id)::int as users
    from bought b
    where b.store_key is not null and length(b.store_key) >= 3
    group by b.country, b.store_key
  )
  select s.country, s.store_key, s.name, s.domain, s.users
  from stores s
  where not public._not_a_store(s.store_key)
    -- Covered: a program for this store ("chipotle" covers "Chipotle Mexican Grill", "massy" covers "Massy Stores").
    and not exists (
      select 1 from public.perk_programs pp, unnest(pp.merchants) m
      where (public.store_key(m) = s.store_key or (length(public.store_key(m)) >= 4 and s.store_key like public.store_key(m) || '%'))
        and (pp.countries = '{}' or s.country = any (pp.countries)))
    and not exists (select 1 from public.perk_candidates c where c.store_key = s.store_key and c.country = s.country and c.status <> 'rejected')
    and not exists (select 1 from public.perk_store_checks k where k.store_key = s.store_key and k.country = s.country and k.checked_at > now() - interval '30 days')
  order by s.users desc, s.store_key
  limit p_limit
$$;
revoke execute on function public._perk_store_candidates(int) from public, anon, authenticated;
grant execute on function public._perk_store_candidates(int) to service_role;

-- Approve (publish) or reject a held perk. Service role only: run from the review script.
create or replace function public.review_perk_candidate(p_id text, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare c public.perk_candidates;
begin
  select * into c from public.perk_candidates where id = p_id and status = 'review';
  if not found then raise exception 'No perk waiting for review with id %', p_id; end if;
  if p_approve then
    insert into public.perk_programs (id, kind, name, provider, countries, summary, how_to, url, merchants, interests, status, source_url, last_verified, origin, evidence, sort_order)
    values (c.id, 'free_perk', c.name, c.provider, array[c.country], c.summary, c.how_to, c.url, c.merchants, c.interests, 'active', c.url, current_date, 'scout', c.evidence, 900)
    on conflict (id) do update set name = excluded.name, summary = excluded.summary, how_to = excluded.how_to, url = excluded.url, status = 'active',
      source_url = excluded.source_url, last_verified = excluded.last_verified, evidence = excluded.evidence;
  end if;
  update public.perk_candidates set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now() where id = p_id;
  return case when p_approve then 'published' else 'rejected' end;
end
$$;
revoke execute on function public.review_perk_candidate(text, boolean) from public, anon, authenticated;
grant execute on function public.review_perk_candidate(text, boolean) to service_role;

-- What the catalog is missing, as counts: stores without a perk, and cards seen in email that aren't in
-- the card catalog. For deciding what to add next; service role only.
create or replace view public.perk_coverage_gaps with (security_invoker = true) as
  select 'store'::text as kind, s.country, s.store_key as item, s.users
  from public._perk_store_candidates(200) s
  where s.users >= 2 -- a store only one person uses would point at that person
  union all
  select 'card', null, lower(cs.issuer || ' ' || cs.product), count(distinct cs.user_id)::int
  from public.card_sightings cs
  where cs.product <> '' and cs.dismissed_at is null
    and not exists (select 1 from public.cards c where lower(c.product_name) like '%' || lower(cs.product) || '%')
  group by 1, 2, 3
  having count(distinct cs.user_id) >= 2;
revoke all on public.perk_coverage_gaps from public, anon, authenticated;
grant select on public.perk_coverage_gaps to service_role;
