-- Perks a student adds from their own school (e.g. a campus discount PerkScan doesn't list yet).
-- Private to them. With "suggest", PerkScan may review it to add for everyone at that school.
create table public.user_perks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  university_id text references public.universities (id) on delete set null,
  title         text not null check (char_length(trim(title)) between 1 and 80),
  details       text check (char_length(details) <= 280),
  url           text check (url is null or url ~ '^https?://[^\s]+$'),
  suggest       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index user_perks_user_idx on public.user_perks (user_id);

alter table public.user_perks enable row level security;
revoke all on public.user_perks from anon;
revoke update, truncate on public.user_perks from authenticated;
grant select, insert, delete on public.user_perks to authenticated;
grant update (university_id, title, details, url, suggest) on public.user_perks to authenticated;
create policy "own perks: select" on public.user_perks for select to authenticated using (user_id = (select auth.uid()));
create policy "own perks: insert" on public.user_perks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own perks: update" on public.user_perks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own perks: delete" on public.user_perks for delete to authenticated using (user_id = (select auth.uid()));
