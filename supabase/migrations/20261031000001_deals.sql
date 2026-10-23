-- Deals for you: store deals matched to each person's interests and where they live.
--   deal_sources:   official pages PerkScan checks automatically (stores, banks, government), seed/deal_sources.json
--   deals:          what the scout found on those pages, plus public codes many users received (opt-in)
--   deal_feedback:  saved / not for me / didn't work, per user
--   deal_sightings: public promo codes seen in opted-in users' email; each user sees only their own

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- What you're into, your US state, and whether public codes from your email may help others.
-- ---------------------------------------------------------------------------
create function public.deal_categories() returns text[] language sql immutable set search_path = '' as $$
  select array['groceries', 'dining', 'delivery', 'electronics', 'fashion', 'home', 'travel', 'beauty',
               'fitness', 'entertainment', 'fuel', 'kids', 'pets', 'education', 'shopping']::text[]
$$;

alter table public.profiles
  add column interests text[] not null default '{}' check (interests <@ public.deal_categories()),
  add column region text check (region ~ '^[A-Z]{2}$'),
  add column share_deals boolean not null default false;
grant update (interests, region, share_deals) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Sources: one official page each. The scout only ever reads these pages.
-- ---------------------------------------------------------------------------
create table public.deal_sources (
  id            text primary key,
  name          text not null,
  kind          text not null check (kind in ('store', 'bank', 'government')),
  url           text not null check (url like 'https://%'),
  countries     text[] not null check (cardinality(countries) > 0),
  regions       text[] not null default '{}',
  categories    text[] not null default '{}' check (categories <@ public.deal_categories()),
  -- Names to recognise the store by in receipts and sender domains, lower case.
  merchants     text[] not null default '{}',
  -- Bank pages: whose cardholders the promotions are for.
  issuers       text[] not null default '{}',
  card_keywords text[] not null default '{}',
  active        boolean not null default true,
  sort_order    int not null default 0,
  -- Scout bookkeeping.
  last_checked  timestamptz,
  last_status   text,
  last_found    int,
  failures      int not null default 0
);
alter table public.deal_sources enable row level security;
revoke all on public.deal_sources from anon;
revoke insert, update, delete, truncate on public.deal_sources from authenticated;
grant select on public.deal_sources to authenticated;
create policy "deal sources: read" on public.deal_sources for select to authenticated using (true);

-- Events the scout finds on bank and government pages sit next to the hand-checked catalog.
alter table public.local_events add column source_id text references public.deal_sources (id) on delete cascade;
alter table public.local_events add column evidence text;

-- ---------------------------------------------------------------------------
-- Deals
-- ---------------------------------------------------------------------------
create table public.deals (
  id            uuid primary key default gen_random_uuid(),
  dedupe_key    text not null unique,
  -- official: read from the store's own page. shared: the same public code reached 3+ people.
  -- affiliate: a store's feed through an affiliate network (not connected yet).
  source        text not null check (source in ('official', 'shared', 'affiliate')),
  source_id     text references public.deal_sources (id) on delete cascade,
  merchant      text not null check (char_length(merchant) between 1 and 80),
  merchant_keys text[] not null default '{}',
  title         text not null check (char_length(title) between 1 and 120),
  summary       text check (char_length(summary) <= 300),
  category      text not null check (category = any (public.deal_categories())),
  amount        numeric(12, 2) check (amount >= 0),
  percent_off   numeric(5, 2) check (percent_off > 0 and percent_off <= 100),
  currency      text check (currency ~ '^[A-Z]{3}$'),
  code          text check (code ~ '^[A-Za-z0-9-]{3,40}$'),
  min_spend     numeric(12, 2) check (min_spend >= 0),
  countries     text[] not null check (cardinality(countries) > 0),
  regions       text[] not null default '{}',
  starts_on     date,
  ends_on       date,
  url           text check (url like 'https://%'),
  -- The words on the page that back it up, quoted exactly.
  evidence      text check (char_length(evidence) <= 600),
  confidence    text not null check (confidence in ('confirmed', 'likely', 'check')),
  seen_by       int not null default 0,
  saves         int not null default 0,
  reports       int not null default 0,
  hidden        boolean not null default false,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check (source = 'shared' or url is not null),
  check (source <> 'official' or (source_id is not null and evidence is not null))
);
create index deals_ends_on_idx on public.deals (ends_on);
create index deals_countries_idx on public.deals using gin (countries);
alter table public.deals enable row level security;
revoke all on public.deals from anon;
revoke insert, update, delete, truncate on public.deals from authenticated;
grant select on public.deals to authenticated;
create policy "deals: read visible" on public.deals for select to authenticated using (not hidden);

-- ---------------------------------------------------------------------------
-- Feedback: what you saved, hid, or found didn't work.
-- ---------------------------------------------------------------------------
create table public.deal_feedback (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deal_id    uuid not null references public.deals (id) on delete cascade,
  action     text not null check (action in ('saved', 'dismissed', 'didnt_work')),
  created_at timestamptz not null default now(),
  primary key (user_id, deal_id, action)
);
alter table public.deal_feedback enable row level security;
revoke all on public.deal_feedback from anon;
revoke insert, update, delete, truncate on public.deal_feedback from authenticated;
grant select on public.deal_feedback to authenticated;
create policy "own deal feedback: select" on public.deal_feedback for select to authenticated using (user_id = (select auth.uid()));

-- How many people must say a deal didn't work before it's hidden for everyone.
create function public._deal_report_threshold() returns int language sql immutable set search_path = '' as $$ select 3 $$;

/** Save a deal (it becomes a reminder in Money), hide it for yourself, or say it didn't work. */
create function public.deal_feedback(p_deal uuid, p_action text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_deal public.deals;
  v_opp uuid;
  v_steps jsonb;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_action not in ('saved', 'dismissed', 'didnt_work') then
    raise exception 'Unsupported action %', p_action using errcode = '22023';
  end if;
  select * into v_deal from public.deals where id = p_deal and not hidden;
  if not found then
    raise exception 'That deal is gone' using errcode = 'P0002';
  end if;

  insert into public.deal_feedback (user_id, deal_id, action) values (v_user, p_deal, p_action)
  on conflict do nothing;
  if not found then
    return null; -- already recorded
  end if;

  if p_action = 'didnt_work' then
    update public.deals d set
      reports = d.reports + 1,
      hidden = d.reports + 1 >= public._deal_report_threshold()
    where d.id = p_deal;
    return null;
  end if;
  if p_action = 'dismissed' then
    return null;
  end if;

  update public.deals d set saves = d.saves + 1 where d.id = p_deal;
  v_steps := jsonb_build_array(jsonb_build_object('step', coalesce(v_deal.summary, v_deal.title)));
  if v_deal.url is not null then
    v_steps := v_steps || jsonb_build_array(jsonb_build_object('step', v_deal.merchant || ' terms', 'url', v_deal.url));
  end if;
  insert into public.opportunities (user_id, type, title, description, merchant, code, value_estimate, currency, expires_at, action_steps, dedupe_key)
  values (
    v_user,
    'promo',
    v_deal.title,
    case v_deal.source when 'shared' then 'Deal many PerkScan users received' else 'Deal from ' || v_deal.merchant end,
    v_deal.merchant,
    v_deal.code,
    v_deal.amount,
    coalesce(v_deal.currency, (select home_currency from public.profiles where id = v_user), 'USD'),
    case when v_deal.ends_on is null then null else (v_deal.ends_on + time '23:59:59') at time zone 'UTC' end,
    v_steps,
    -- The app reads the deal's confidence back from the key.
    'deal:' || v_deal.confidence || ':' || v_deal.id
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_opp;
  return v_opp;
end;
$$;
revoke all on function public.deal_feedback(uuid, text) from public, anon;
grant execute on function public.deal_feedback(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Public codes seen in opted-in users' email. Only the store, offer, code and dates —
-- never the email. Each user can read (and export) only their own rows.
-- ---------------------------------------------------------------------------
create table public.deal_sightings (
  user_id      uuid not null references auth.users (id) on delete cascade,
  country      text not null check (country ~ '^[A-Z]{2}$'),
  merchant     text not null check (char_length(merchant) between 1 and 80),
  merchant_key text not null check (merchant_key ~ '^[a-z0-9]{2,60}$'),
  code         text not null check (code ~ '^[A-Z0-9-]{3,40}$'),
  title        text not null check (char_length(title) between 1 and 120),
  amount       numeric(12, 2),
  percent_off  numeric(5, 2),
  currency     text,
  min_spend    numeric(12, 2),
  ends_on      date,
  seen_at      timestamptz not null default now(),
  primary key (user_id, merchant_key, code)
);
alter table public.deal_sightings enable row level security;
revoke all on public.deal_sightings from anon, authenticated;
grant select on public.deal_sightings to authenticated;
create policy "own deal sightings: select" on public.deal_sightings for select to authenticated using (user_id = (select auth.uid()));

-- How many different people must have received the same code before it counts as public.
create function public._shared_deal_threshold() returns int language sql immutable set search_path = '' as $$ select 3 $$;

/** Publishes codes that reached enough different people; unpublishes ones that no longer do. */
create function public._promote_shared_deals() returns int
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
      s.country, s.merchant_key, s.code,
      count(distinct s.user_id) as people,
      mode() within group (order by s.merchant) as merchant,
      mode() within group (order by s.title) as title,
      -- Amounts and dates only when everyone who got it agrees.
      case when count(distinct s.amount) = 1 and count(s.amount) = count(*) then min(s.amount) end as amount,
      case when count(distinct s.percent_off) = 1 and count(s.percent_off) = count(*) then min(s.percent_off) end as percent_off,
      case when count(distinct s.currency) = 1 then min(s.currency) end as currency,
      case when count(distinct s.min_spend) = 1 and count(s.min_spend) = count(*) then min(s.min_spend) end as min_spend,
      case when count(distinct s.ends_on) = 1 and count(s.ends_on) = count(*) then min(s.ends_on) end as ends_on
    from public.deal_sightings s
    group by s.country, s.merchant_key, s.code
    having count(distinct s.user_id) >= public._shared_deal_threshold()
  )
  insert into public.deals (dedupe_key, source, merchant, merchant_keys, title, category, amount, percent_off, currency, code, min_spend, countries, ends_on, confidence, seen_by, last_seen)
  select
    'shared:' || g.country || ':' || g.merchant_key || ':' || g.code,
    'shared', g.merchant, array[g.merchant_key], g.title,
    coalesce((select src.categories[1] from public.deal_sources src where g.merchant_key = any (src.merchants) and cardinality(src.categories) > 0 limit 1), 'shopping'),
    g.amount, g.percent_off, g.currency, g.code, g.min_spend, array[g.country], g.ends_on,
    'likely', g.people, now()
  from groups g
  on conflict (dedupe_key) do update set
    seen_by = excluded.seen_by, title = excluded.title, amount = excluded.amount, percent_off = excluded.percent_off,
    currency = excluded.currency, min_spend = excluded.min_spend, ends_on = excluded.ends_on, last_seen = now();
  get diagnostics v_count = row_count;

  -- Fell below the threshold (people turned sharing off, or sightings aged out).
  delete from public.deals d
  where d.source = 'shared'
    and (select count(distinct s.user_id) from public.deal_sightings s
         where 'shared:' || s.country || ':' || s.merchant_key || ':' || s.code = d.dedupe_key) < public._shared_deal_threshold();
  return v_count;
end;
$$;

/** Ended deals go; official ones the scout hasn't seen on their page for a week go too. */
create function public._purge_old_deals() returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.deals where ends_on < current_date - 1;
  delete from public.deals where source = 'official' and last_seen < now() - interval '7 days';
  delete from public.local_events where source_id is not null and ends_on < current_date - 1;
$$;

/**
 * Wakes the scout Edge Function. It needs two Vault secrets, set once per project:
 *   select vault.create_secret('https://<project>.supabase.co/functions/v1/scout', 'scout_url');
 *   select vault.create_secret('<the SCOUT_SECRET you gave the function>', 'scout_secret');
 * Without them this does nothing.
 */
create function public._invoke_scout() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'scout_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'scout_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke execute on function public._promote_shared_deals() from public, anon, authenticated;
revoke execute on function public._purge_old_deals() from public, anon, authenticated;
revoke execute on function public._invoke_scout() from public, anon, authenticated;

-- A few sources per run, every hour: each page is re-read about once a day.
select cron.schedule('perkscan-scout', '23 * * * *', $$select public._invoke_scout()$$);
select cron.schedule('perkscan-shared-deals', '41 * * * *', $$select public._promote_shared_deals()$$);
select cron.schedule('perkscan-purge-deals', '13 4 * * *', $$select public._purge_old_deals()$$);
