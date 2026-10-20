-- Row Level Security: on for every table. Users only ever see their own rows.
-- Writes that must stay consistent (credit usage, recovered money) go through
-- SECURITY DEFINER functions in the next migration instead of direct table writes.

alter table public.cards               enable row level security;
alter table public.card_benefits       enable row level security;
alter table public.settlements         enable row level security;
alter table public.student_discounts   enable row level security;
alter table public.profiles            enable row level security;
alter table public.user_cards          enable row level security;
alter table public.benefit_usage       enable row level security;
alter table public.inbound_messages    enable row level security;
alter table public.receipts            enable row level security;
alter table public.opportunities       enable row level security;
alter table public.recovered           enable row level security;
alter table public.user_student_claims enable row level security;
alter table public.ingest_tokens       enable row level security;

-- Nothing is readable without signing in.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Catalog: read-only for signed-in users; only the service role writes.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.cards, public.card_benefits,
  public.settlements, public.student_discounts from authenticated;

create policy "catalog readable" on public.cards
  for select to authenticated using (true);
create policy "catalog readable" on public.card_benefits
  for select to authenticated using (true);
create policy "catalog readable" on public.settlements
  for select to authenticated using (true);
create policy "catalog readable" on public.student_discounts
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- profiles: read/update own row. Rows are created by the signup trigger.
-- forwarding_address is managed by the backend, so it is not user-updatable.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant update (display_name, is_student, timezone, onboarded_at) on public.profiles to authenticated;

create policy "own profile: select" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- user_cards: full CRUD on own rows.
-- ---------------------------------------------------------------------------
create policy "own cards: select" on public.user_cards
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own cards: insert" on public.user_cards
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own cards: update" on public.user_cards
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own cards: delete" on public.user_cards
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Read-only for users (written by RPCs / Edge Functions with the service role).
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.benefit_usage, public.inbound_messages,
  public.receipts, public.recovered, public.ingest_tokens from authenticated;

create policy "own usage: select" on public.benefit_usage
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own messages: select" on public.inbound_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own receipts: select" on public.receipts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own recovered: select" on public.recovered
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own tokens: select" on public.ingest_tokens
  for select to authenticated using (user_id = (select auth.uid()));
-- Never expose the token hash itself to the client.
revoke select on public.ingest_tokens from authenticated;
grant select (id, user_id, created_at, revoked_at) on public.ingest_tokens to authenticated;

-- ---------------------------------------------------------------------------
-- opportunities: users can read their own and change status (claim/dismiss).
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.opportunities from authenticated;
grant update (status) on public.opportunities to authenticated;

create policy "own opportunities: select" on public.opportunities
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own opportunities: update status" on public.opportunities
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- user_student_claims: own rows.
-- ---------------------------------------------------------------------------
revoke update, truncate on public.user_student_claims from authenticated;
create policy "own student claims: select" on public.user_student_claims
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own student claims: insert" on public.user_student_claims
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own student claims: delete" on public.user_student_claims
  for delete to authenticated using (user_id = (select auth.uid()));
