-- Deals you wouldn't see in your own inbox:
--   1. Public promotions other people near you received, with or without a code (opt-in, 3+ people).
--   2. "Popular with people who use …": which stores tend to go together, counted only across
--      people who opted in, and only shown when at least 5 of them share it.
--   3. A store list that grows by itself from the stores PerkScan users in each country deal with.

-- ---------------------------------------------------------------------------
-- One way to name a store, shared by receipts, sender domains and deals:
-- "COURTS (TRINIDAD) LTD" -> "courts", "Massy Stores" -> "massystores".
-- ---------------------------------------------------------------------------
create function public.store_key(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(regexp_replace(
    regexp_replace(lower(coalesce(p, '')), '\m(ltd|limited|inc|llc|corp|company|the|trinidad|tobago|jamaica|barbados|usa)\M', ' ', 'g'),
    '[^a-z0-9]', '', 'g'), 60), '')
$$;

/** "email.courts.co.tt" or "courts.co.tt" -> "courts"; "mail.target.com" -> "target". */
create function public.domain_store_key(p_domain text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_domain is null then null
    when lower(p_domain) ~ '\.(gov|edu|mil)(\.[a-z]{2})?$' then null
    else public.store_key(
      (string_to_array(lower(p_domain), '.'))[
        cardinality(string_to_array(lower(p_domain), '.'))
        - case when lower(p_domain) ~ '\.(co|com|net|org|ac)\.[a-z]{2}$' then 2 else 1 end
      ])
  end
$$;

/** Senders that aren't stores: mail providers, social networks, banks (their pages are kept by hand). */
create function public._not_a_store(p_key text) returns boolean
language sql immutable set search_path = '' as $$
  select p_key is null or length(p_key) < 3 or p_key = any (array[
    'gmail', 'googlemail', 'google', 'yahoo', 'outlook', 'hotmail', 'live', 'icloud', 'apple', 'me', 'microsoft',
    'facebook', 'facebookmail', 'instagram', 'linkedin', 'twitter', 'tiktok', 'youtube', 'whatsapp', 'github',
    'supabase', 'zoom', 'slack', 'notion', 'dropbox', 'docusign', 'mailchimp', 'sendgrid', 'amazonses',
    'perkscan', 'paypal', 'scotiabank', 'republictt', 'firstcitizensgroup', 'firstcitizenstt', 'rbc',
    'chase', 'citi', 'citibank', 'capitalone', 'americanexpress', 'aexp', 'discover', 'bankofamerica',
    'wellsfargo', 'usbank', 'mastercard', 'visa', 'uwi'
  ]::text[])
$$;

-- ---------------------------------------------------------------------------
-- 1. Shared promotions without a code. Same promotion = same store, same amount or
--    percentage, same end date (titles vary between emails; numbers don't).
-- ---------------------------------------------------------------------------
alter table public.deal_sightings add column offer_key text;
update public.deal_sightings set offer_key = code where offer_key is null;
alter table public.deal_sightings alter column offer_key set not null;
alter table public.deal_sightings add constraint deal_sightings_offer_key_check check (offer_key ~ '^[A-Za-z0-9:.-]{3,80}$');
alter table public.deal_sightings drop constraint deal_sightings_pkey;
alter table public.deal_sightings add primary key (user_id, merchant_key, offer_key);
alter table public.deal_sightings alter column code drop not null;
-- A promotion without a code must at least have a number and an end date to be recognised.
alter table public.deal_sightings add constraint deal_sightings_codeless_check
  check (code is not null or ((amount is not null or percent_off is not null) and ends_on is not null));

create or replace function public._promote_shared_deals() returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  -- Only people who still have sharing on count.
  delete from public.deal_sightings s using public.profiles p where p.id = s.user_id and not p.share_deals;
  delete from public.deal_sightings where seen_at < now() - interval '90 days' or ends_on < current_date;

  with groups as (
    select
      s.country, s.merchant_key, s.offer_key,
      count(distinct s.user_id) as people,
      mode() within group (order by s.merchant) as merchant,
      mode() within group (order by s.title) as title,
      case when count(distinct s.code) = 1 and count(s.code) = count(*) then min(s.code) end as code,
      -- Amounts and dates only when everyone who got it agrees.
      case when count(distinct s.amount) = 1 and count(s.amount) = count(*) then min(s.amount) end as amount,
      case when count(distinct s.percent_off) = 1 and count(s.percent_off) = count(*) then min(s.percent_off) end as percent_off,
      case when count(distinct s.currency) = 1 then min(s.currency) end as currency,
      case when count(distinct s.min_spend) = 1 and count(s.min_spend) = count(*) then min(s.min_spend) end as min_spend,
      case when count(distinct s.ends_on) = 1 and count(s.ends_on) = count(*) then min(s.ends_on) end as ends_on
    from public.deal_sightings s
    group by s.country, s.merchant_key, s.offer_key
    having count(distinct s.user_id) >= public._shared_deal_threshold()
  )
  insert into public.deals (dedupe_key, source, merchant, merchant_keys, title, category, amount, percent_off, currency, code, min_spend, countries, ends_on, confidence, seen_by, last_seen)
  select
    'shared:' || g.country || ':' || g.merchant_key || ':' || g.offer_key,
    'shared', g.merchant, array[g.merchant_key], g.title,
    coalesce((select src.categories[1] from public.deal_sources src where g.merchant_key = any (src.merchants) and cardinality(src.categories) > 0 limit 1), 'shopping'),
    g.amount, g.percent_off, g.currency, g.code, g.min_spend, array[g.country], g.ends_on,
    'likely', g.people, now()
  from groups g
  -- A code-less promotion needs its number and date to agree across people, or it isn't shown.
  where g.code is not null or ((g.amount is not null or g.percent_off is not null) and g.ends_on is not null)
  on conflict (dedupe_key) do update set
    seen_by = excluded.seen_by, title = excluded.title, code = excluded.code, amount = excluded.amount, percent_off = excluded.percent_off,
    currency = excluded.currency, min_spend = excluded.min_spend, ends_on = excluded.ends_on, last_seen = now();
  get diagnostics v_count = row_count;

  -- Fell below the threshold (people turned sharing off, or sightings aged out).
  delete from public.deals d
  where d.source = 'shared'
    and (select count(distinct s.user_id) from public.deal_sightings s
         where 'shared:' || s.country || ':' || s.merchant_key || ':' || s.offer_key = d.dedupe_key) < public._shared_deal_threshold();
  return v_count;
end;
$$;
revoke execute on function public._promote_shared_deals() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Which stores go together, per country. Built only from people who turned on
--    "Help people nearby find deals", and only kept when at least 5 of them share it,
--    so no one can be singled out. Store names only — never amounts, dates or emails.
-- ---------------------------------------------------------------------------
create function public._store_stats_min_people() returns int language sql immutable set search_path = '' as $$ select 5 $$;

create table public.store_stats (
  country   text not null check (country ~ '^[A-Z]{2}$'),
  store_key text not null,
  people    int not null,
  primary key (country, store_key)
);
create table public.store_pairs (
  country text not null check (country ~ '^[A-Z]{2}$'),
  store_a text not null,
  store_b text not null,
  people  int not null,
  primary key (country, store_a, store_b)
);
alter table public.store_stats enable row level security;
alter table public.store_pairs enable row level security;
revoke all on public.store_stats, public.store_pairs from anon;
revoke insert, update, delete, truncate on public.store_stats, public.store_pairs from authenticated;
grant select on public.store_stats, public.store_pairs to authenticated;
create policy "store stats: read" on public.store_stats for select to authenticated using (true);
create policy "store pairs: read" on public.store_pairs for select to authenticated using (true);

create function public._refresh_store_stats() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  create temporary table _us on commit drop as
  select distinct u.user_id, u.country, u.store_key
  from (
    select r.user_id, p.country, public.store_key(r.merchant) as store_key
    from public.receipts r join public.profiles p on p.id = r.user_id
    where p.share_deals and p.country is not null and r.created_at > now() - interval '365 days'
    union all
    select m.user_id, p.country, public.domain_store_key(m.from_domain)
    from public.inbound_messages m join public.profiles p on p.id = m.user_id
    where p.share_deals and p.country is not null and m.from_domain is not null and m.received_at > now() - interval '365 days'
  ) u
  where not public._not_a_store(u.store_key);

  delete from public.store_stats;
  insert into public.store_stats (country, store_key, people)
  select country, store_key, count(*) from _us group by country, store_key
  having count(*) >= public._store_stats_min_people();

  delete from public.store_pairs;
  insert into public.store_pairs (country, store_a, store_b, people)
  select a.country, a.store_key, b.store_key, count(*)
  from _us a join _us b on b.user_id = a.user_id and b.country = a.country and b.store_key <> a.store_key
  group by a.country, a.store_key, b.store_key
  having count(*) >= public._store_stats_min_people();
end;
$$;
revoke execute on function public._refresh_store_stats() from public, anon, authenticated;
select cron.schedule('perkscan-store-stats', '51 3 * * *', $$select public._refresh_store_stats()$$);

-- ---------------------------------------------------------------------------
-- 3. Stores to look for: domains that email at least a few PerkScan users in a country.
--    Only the store's public domain is used; nobody sees who gets its emails.
-- ---------------------------------------------------------------------------
alter table public.deal_sources
  add column origin text not null default 'seed' check (origin in ('seed', 'discovered')),
  add column discovered_users int;

create table public.store_domain_checks (
  domain     text not null,
  country    text not null,
  result     text not null,
  checked_at timestamptz not null default now(),
  primary key (domain, country)
);
alter table public.store_domain_checks enable row level security;
revoke all on public.store_domain_checks from anon, authenticated;

create function public._store_candidates(p_min_users int default 3, p_limit int default 3)
returns table (country text, domain text, store_key text, name text, users int)
language sql
stable
security definer
set search_path = ''
as $$
  with seen as (
    select p.country, m.from_domain as domain, public.domain_store_key(m.from_domain) as store_key, count(distinct m.user_id)::int as users
    from public.inbound_messages m join public.profiles p on p.id = m.user_id
    where p.country is not null and m.from_domain is not null and m.received_at > now() - interval '365 days'
    group by p.country, m.from_domain
    having count(distinct m.user_id) >= p_min_users
  )
  select s.country, s.domain, s.store_key,
    -- The store's own name, as the email reader saw it most often.
    coalesce((
      select mode() within group (order by o.merchant)
      from public.opportunities o join public.inbound_messages m on m.id = o.source_message_id
      where m.from_domain = s.domain and o.merchant is not null
    ), initcap(s.store_key)) as name,
    s.users
  from seen s
  where not public._not_a_store(s.store_key)
    and not exists (select 1 from public.deal_sources d where s.country = any (d.countries) and d.url ~* ('^https://([a-z0-9-]+\.)*' || replace(s.domain, '.', '\.') || '(/|$)'))
    and not exists (select 1 from public.store_domain_checks c where c.domain = s.domain and c.country = s.country and c.checked_at > now() - interval '30 days')
  order by s.users desc
  limit p_limit
$$;
revoke execute on function public._store_candidates(int, int) from public, anon, authenticated;
grant execute on function public._store_candidates(int, int) to service_role;
