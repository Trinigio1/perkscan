-- Right moment: an optional birth month (never the day or year), so PerkScan can say when birthday
-- rewards at your stores are ready. Only the user can see or change it.
alter table public.profiles add column if not exists birth_month smallint;
alter table public.profiles drop constraint if exists profiles_birth_month_check;
alter table public.profiles add constraint profiles_birth_month_check check (birth_month between 1 and 12);
grant update (birth_month) on public.profiles to authenticated;
