-- Coming up near you: dated, money-related events by country (seed/events.json).
-- Maintained by PerkScan, readable by signed-in users.
create table public.local_events (
  id            text primary key,
  title         text not null,
  summary       text not null,
  category      text not null check (category in ('bank_promo', 'free_day', 'enrollment', 'deadline', 'sale', 'student')),
  countries     text[] not null check (cardinality(countries) > 0),
  regions       text[] not null default '{}',  -- e.g. US states; empty = the whole country
  issuers       text[] not null default '{}',  -- card issuers it's for; empty = everyone
  starts_on     date not null,
  ends_on       date not null,
  url           text not null check (url like 'https://%'),
  -- confirmed: announced for these dates. expected: recurring, dates from last time.
  status        text not null check (status in ('confirmed', 'expected')),
  based_on      text,
  source_url    text not null check (source_url like 'https://%'),
  last_verified date not null,
  sort_order    int not null default 0,
  check (ends_on >= starts_on),
  check (status <> 'expected' or based_on is not null)
);
create index local_events_ends_on_idx on public.local_events (ends_on);
alter table public.local_events enable row level security;
revoke all on public.local_events from anon;
revoke insert, update, delete, truncate on public.local_events from authenticated;
grant select on public.local_events to authenticated;
create policy "local events: read" on public.local_events for select to authenticated using (true);
