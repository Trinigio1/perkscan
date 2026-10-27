-- "Hide offers from this store": the user's own list of stores whose marketing PerkScan skips (before
-- any AI reading). Their receipts are still read, for card protections and spending.
create table public.store_mutes (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store_key  text not null check (store_key ~ '^[a-z0-9]{2,60}$'),
  name       text check (char_length(name) <= 80),
  created_at timestamptz not null default now(),
  primary key (user_id, store_key)
);
alter table public.store_mutes enable row level security;
revoke all on public.store_mutes from anon;
create policy "store mutes: select own" on public.store_mutes for select to authenticated using (user_id = (select auth.uid()));
create policy "store mutes: insert own" on public.store_mutes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "store mutes: delete own" on public.store_mutes for delete to authenticated using (user_id = (select auth.uid()));
