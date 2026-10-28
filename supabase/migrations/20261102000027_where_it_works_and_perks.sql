-- 1. Where a code works. Delivery apps and big stores often limit a code to some restaurants or stores,
--    or to a first order. The reader now records that, so it's shown before you try the code.
alter table public.opportunities
  add column if not exists valid_at text check (valid_at is null or length(valid_at) <= 120),
  add column if not exists first_order_only boolean;

-- 2. Hidden value in Deals: perks you have access to without an email (birthday and loyalty rewards at
--    stores you use, issuer perks like Museums on Us, free national programs), ranked for each person.
--    Brings back what 20261102000012 removed, now shown inside Deals.
alter table public.perk_programs drop constraint if exists perk_programs_kind_check;
alter table public.perk_programs add constraint perk_programs_kind_check
  check (kind in ('loyalty', 'price_adjust', 'unclaimed', 'library', 'refund_rule', 'deadline_rule', 'free_perk'));
alter table public.perk_programs
  add column if not exists interests text[] not null default '{}',
  add column if not exists issuers text[] not null default '{}',
  add column if not exists student_only boolean not null default false;

-- "I have it" / "Not for me" on a perk: it stops being suggested, and it teaches PerkScan what you like.
create table if not exists public.perk_feedback (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_id text not null references public.perk_programs (id) on delete cascade,
  action     text not null check (action in ('have', 'dismissed')),
  created_at timestamptz not null default now(),
  primary key (user_id, program_id)
);
alter table public.perk_feedback enable row level security;
revoke all on public.perk_feedback from anon;
drop policy if exists "perk feedback: select own" on public.perk_feedback;
drop policy if exists "perk feedback: insert own" on public.perk_feedback;
drop policy if exists "perk feedback: update own" on public.perk_feedback;
drop policy if exists "perk feedback: delete own" on public.perk_feedback;
create policy "perk feedback: select own" on public.perk_feedback for select to authenticated using (user_id = (select auth.uid()));
create policy "perk feedback: insert own" on public.perk_feedback for insert to authenticated with check (user_id = (select auth.uid()));
create policy "perk feedback: update own" on public.perk_feedback for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "perk feedback: delete own" on public.perk_feedback for delete to authenticated using (user_id = (select auth.uid()));
