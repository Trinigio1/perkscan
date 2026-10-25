-- Perks people qualify for without an email: free loyalty and birthday rewards at stores they use,
-- card-issuer perks (Museums on Us, card-linked offers), free national programs. Ranked for each person
-- in the app by where they shop, the cards they hold, their interests and where they live.

alter table public.perk_programs drop constraint perk_programs_kind_check;
alter table public.perk_programs add constraint perk_programs_kind_check
  check (kind in ('loyalty', 'price_adjust', 'unclaimed', 'library', 'refund_rule', 'deadline_rule', 'free_perk'));
alter table public.perk_programs
  add column interests text[] not null default '{}',
  add column issuers text[] not null default '{}',
  add column student_only boolean not null default false;

-- "I have it" / "Not for me" on a perk, so it stops being suggested.
create table public.perk_feedback (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_id text not null references public.perk_programs (id) on delete cascade,
  action     text not null check (action in ('have', 'dismissed')),
  created_at timestamptz not null default now(),
  primary key (user_id, program_id)
);
alter table public.perk_feedback enable row level security;
revoke all on public.perk_feedback from anon;
create policy "perk feedback: select own" on public.perk_feedback for select to authenticated using (user_id = (select auth.uid()));
create policy "perk feedback: insert own" on public.perk_feedback for insert to authenticated with check (user_id = (select auth.uid()));
create policy "perk feedback: update own" on public.perk_feedback for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "perk feedback: delete own" on public.perk_feedback for delete to authenticated using (user_id = (select auth.uid()));
