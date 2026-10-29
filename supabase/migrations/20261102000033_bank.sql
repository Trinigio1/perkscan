-- Bank connection: every card purchase, not only the ones that send an email.
-- Provider-agnostic (Plaid first). The user can see their connections and accounts (name and last four
-- only); access tokens live in bank_secrets, encrypted by the edge function, readable by the service only.
-- Transactions become card-alert receipts (merchant, amount, date, last four): no raw bank data is kept.

create table if not exists public.bank_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  provider         text not null check (provider in ('plaid')),
  item_id          text not null,
  institution_name text,
  status           text not null default 'active' check (status in ('active', 'needs_login', 'error', 'revoked')),
  cursor           text,
  last_synced_at   timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  unique (provider, item_id)
);
create index if not exists bank_connections_user_idx on public.bank_connections (user_id);
alter table public.bank_connections enable row level security;
revoke all on public.bank_connections from anon, authenticated;
grant select on public.bank_connections to authenticated;
drop policy if exists "bank connections: select own" on public.bank_connections;
create policy "bank connections: select own" on public.bank_connections for select to authenticated using (user_id = (select auth.uid()));
-- The cursor is bookkeeping, not for the app.
revoke select on public.bank_connections from authenticated;
grant select (id, user_id, provider, institution_name, status, last_synced_at, last_error, created_at) on public.bank_connections to authenticated;

-- Encrypted access tokens. No user policies: the service role only.
create table if not exists public.bank_secrets (
  connection_id uuid primary key references public.bank_connections (id) on delete cascade,
  access_token  text not null check (access_token like 'v1:%'),
  updated_at    timestamptz not null default now()
);
alter table public.bank_secrets enable row level security;
revoke all on public.bank_secrets from anon, authenticated;

-- Accounts in a connection: only the name, type and last four digits.
create table if not exists public.bank_accounts (
  connection_id uuid not null references public.bank_connections (id) on delete cascade,
  account_id    text not null,
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  mask          text check (mask ~ '^[0-9]{2,4}$'),
  type          text,
  subtype       text,
  primary key (connection_id, account_id)
);
alter table public.bank_accounts enable row level security;
revoke all on public.bank_accounts from anon, authenticated;
grant select on public.bank_accounts to authenticated;
drop policy if exists "bank accounts: select own" on public.bank_accounts;
create policy "bank accounts: select own" on public.bank_accounts for select to authenticated using (user_id = (select auth.uid()));

-- Link sessions waiting for the provider to say the user finished (Hosted Link). Service only; kept a day.
create table if not exists public.bank_link_sessions (
  link_token  text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'open' check (status in ('open', 'done', 'exited')),
  created_at  timestamptz not null default now()
);
alter table public.bank_link_sessions enable row level security;
revoke all on public.bank_link_sessions from anon, authenticated;

-- A bank transaction's receipt keeps the provider's id, so syncing twice never adds it twice.
alter table public.receipts add column if not exists bank_txn_id text;
create unique index if not exists receipts_bank_txn_idx on public.receipts (user_id, bank_txn_id) where bank_txn_id is not null;

-- Old link sessions are dropped daily (they hold no secrets, but nothing needs them after a day).
create or replace function public._prune_bank_link_sessions() returns void language sql security definer set search_path = '' as $$
  delete from public.bank_link_sessions where created_at < now() - interval '1 day';
$$;
revoke execute on function public._prune_bank_link_sessions() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'prune-bank-link-sessions';
    perform cron.schedule('prune-bank-link-sessions', '17 4 * * *', 'select public._prune_bank_link_sessions()');
  end if;
end $$;
