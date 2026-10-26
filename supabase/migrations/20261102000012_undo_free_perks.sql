-- Undo "Perks for you" (20261102000010/11): remove the free perks, the feedback table and the new
-- catalog columns. Kept as a forward migration so it works whether or not those were already pushed.

drop table if exists public.perk_feedback;
delete from public.perk_programs where kind = 'free_perk';
alter table public.perk_programs drop constraint perk_programs_kind_check;
alter table public.perk_programs add constraint perk_programs_kind_check
  check (kind in ('loyalty', 'price_adjust', 'unclaimed', 'library', 'refund_rule', 'deadline_rule'));
alter table public.perk_programs
  drop column if exists interests,
  drop column if exists issuers,
  drop column if exists student_only;
