-- Bank purchases you can take back out:
--   - each connection says whether it's a real bank or Plaid's test bank (Sandbox: made-up practice data);
--   - each purchase a bank brought in remembers which connection it came from;
--   - disconnecting can remove that connection's purchases, and purchases from connections made before
--     this (which can't be traced to one) can be removed in one go.
-- A purchase an email also described is never deleted: it only stops pointing at the bank.

alter table public.bank_connections
  add column if not exists environment text check (environment in ('sandbox', 'production'));

alter table public.receipts
  add column if not exists bank_connection_id uuid references public.bank_connections (id) on delete set null;
create index if not exists receipts_bank_connection_idx on public.receipts (bank_connection_id) where bank_connection_id is not null;

-- p_connection_id: one of your connections; null: purchases from earlier connections that can't be traced.
create or replace function public.remove_bank_purchases(p_connection_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_connection_id is not null and not exists (select 1 from public.bank_connections where id = p_connection_id and user_id = auth.uid()) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  -- Only from the bank: gone.
  delete from public.receipts r
  where r.user_id = auth.uid() and r.bank_txn_id is not null and r.source_message_id is null
    and (case when p_connection_id is null then r.bank_connection_id is null else r.bank_connection_id = p_connection_id end);
  get diagnostics v_removed = row_count;
  -- Also in an email: kept, no longer tied to the bank.
  update public.receipts r set bank_txn_id = null, bank_connection_id = null
  where r.user_id = auth.uid() and r.bank_txn_id is not null and r.source_message_id is not null
    and (case when p_connection_id is null then r.bank_connection_id is null else r.bank_connection_id = p_connection_id end);
  return v_removed;
end;
$$;
revoke all on function public.remove_bank_purchases(uuid) from public, anon;
grant execute on function public.remove_bank_purchases(uuid) to authenticated;
