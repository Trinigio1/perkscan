-- Benefits you pay for: perks that only work once you turn them on (link Grubhub+ to Prime, enroll in a
-- card's Resy credit). "Done" or "Not for me" is kept per person and per card, so the reminder stops.
create table if not exists public.perk_setup (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_card_id uuid not null references public.user_cards (id) on delete cascade,
  benefit_id   text not null references public.card_benefits (id) on delete cascade,
  status       text not null check (status in ('done', 'skipped')),
  updated_at   timestamptz not null default now(),
  primary key (user_id, user_card_id, benefit_id)
);
alter table public.perk_setup enable row level security;
revoke all on public.perk_setup from anon;
drop policy if exists "perk setup: select own" on public.perk_setup;
drop policy if exists "perk setup: insert own" on public.perk_setup;
drop policy if exists "perk setup: update own" on public.perk_setup;
drop policy if exists "perk setup: delete own" on public.perk_setup;
create policy "perk setup: select own" on public.perk_setup for select to authenticated using (user_id = (select auth.uid()));
-- Only for a card that's yours.
create policy "perk setup: insert own" on public.perk_setup for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.user_cards u where u.id = user_card_id and u.user_id = (select auth.uid())));
create policy "perk setup: update own" on public.perk_setup for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.user_cards u where u.id = user_card_id and u.user_id = (select auth.uid())));
create policy "perk setup: delete own" on public.perk_setup for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.perk_setup to authenticated;
