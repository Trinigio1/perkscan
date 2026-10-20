-- Phase 2: inbox ingestion, AI parsing bookkeeping, and non-credit opportunities.

-- ---------------------------------------------------------------------------
-- inbound_messages: dedupe + parse bookkeeping (no raw content kept after parsing)
-- ---------------------------------------------------------------------------
alter table public.inbound_messages
  add column external_id text,          -- e.g. Gmail message id, so re-sends are ignored
  add column attempts int not null default 0,
  add column kind text,                 -- receipt | promo | gift_card | ... (from the parser)
  add column summary text;              -- one short line for the Inbox screen
create unique index inbound_messages_dedupe
  on public.inbound_messages (user_id, source, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- ingest_tokens: personal tokens used by the Gmail script (and later SMS/share)
-- ---------------------------------------------------------------------------
alter table public.ingest_tokens
  add column label text not null default 'Gmail',
  add column last_used_at timestamptz;
grant select (label, last_used_at) on public.ingest_tokens to authenticated;

-- ---------------------------------------------------------------------------
-- receipts / opportunities: fields the parser fills in
-- ---------------------------------------------------------------------------
alter table public.receipts
  add column order_number text,
  add column return_by date;

alter table public.opportunities
  add column merchant text,
  add column code text,                 -- promo / gift card code to show and copy
  add column dedupe_key text;           -- same offer from several emails -> one row
create unique index opportunities_dedupe
  on public.opportunities (user_id, dedupe_key) where dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- ai_usage: token spend per parse, for the monthly budget cap
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  message_id    uuid references public.inbound_messages (id) on delete set null,
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd      numeric(12, 6) not null default 0,
  created_at    timestamptz not null default now()
);
create index ai_usage_created_at_idx on public.ai_usage (created_at);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Forwarding address id (u_xxxxxxxxxx). The domain is added when one exists.
-- ---------------------------------------------------------------------------
create or replace function public.new_forwarding_id()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'u_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, forwarding_address)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    public.new_forwarding_id()
  );
  return new;
end;
$$;

update public.profiles set forwarding_address = public.new_forwarding_id() where forwarding_address is null;

-- ---------------------------------------------------------------------------
-- Token management. The plaintext token is returned once and never stored.
-- ---------------------------------------------------------------------------
create or replace function public.hash_ingest_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

create or replace function public.create_ingest_token(p_label text default 'Gmail')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if (select count(*) from public.ingest_tokens where user_id = auth.uid() and revoked_at is null) >= 5 then
    raise exception 'You already have 5 active tokens. Revoke one first.' using errcode = 'P0001';
  end if;
  v_token := 'psk_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.ingest_tokens (user_id, token_hash, label)
  values (auth.uid(), public.hash_ingest_token(v_token), left(coalesce(nullif(trim(p_label), ''), 'Gmail'), 40));
  return v_token;
end;
$$;

create or replace function public.revoke_ingest_token(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ingest_tokens set revoked_at = now()
  where id = p_id and user_id = auth.uid() and revoked_at is null;
  if not found then
    raise exception 'Token not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Used by the ingest Edge Function (service role only): token -> user.
create or replace function public.resolve_ingest_token(p_token text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.ingest_tokens set last_used_at = now()
  where token_hash = public.hash_ingest_token(p_token) and revoked_at is null
  returning user_id;
$$;

-- ---------------------------------------------------------------------------
-- Mark a non-credit opportunity (promo, gift card, trial, ...) used / dismissed.
-- Card credits keep using mark_credit_used.
-- ---------------------------------------------------------------------------
create or replace function public.mark_opportunity(
  p_opportunity_id uuid,
  p_action text,                -- 'used' | 'dismiss' | 'reopen'
  p_amount numeric default null -- what it was worth to you, if different from the estimate
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.opportunities;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_action not in ('used', 'dismiss', 'reopen') then
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'Amount cannot be negative' using errcode = '22023';
  end if;

  select * into o from public.opportunities
  where id = p_opportunity_id and user_id = auth.uid() and type <> 'card_credit'
  for update;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;

  if p_action = 'used' then
    if coalesce(p_amount, o.value_estimate, 0) > 0 then
      insert into public.recovered (user_id, opportunity_id, amount)
      values (auth.uid(), o.id, coalesce(p_amount, o.value_estimate))
      on conflict (opportunity_id) do update set amount = excluded.amount, recovered_at = now();
    end if;
    update public.opportunities set status = 'claimed' where id = o.id returning * into o;
  else
    delete from public.recovered where opportunity_id = o.id;
    update public.opportunities
    set status = case
      when p_action = 'dismiss' then 'dismissed'::public.opportunity_status
      when expires_at is not null and expires_at <= now() then 'expired'::public.opportunity_status
      else 'open'::public.opportunity_status
    end
    where id = o.id
    returning * into o;
  end if;
  return o;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.new_forwarding_id() from public, anon, authenticated;
revoke execute on function public.hash_ingest_token(text) from public, anon, authenticated;
revoke execute on function public.resolve_ingest_token(text) from public, anon, authenticated;
revoke execute on function public.create_ingest_token(text) from public, anon;
revoke execute on function public.revoke_ingest_token(uuid) from public, anon;
revoke execute on function public.mark_opportunity(uuid, text, numeric) from public, anon;
grant execute on function public.create_ingest_token(text) to authenticated;
grant execute on function public.revoke_ingest_token(uuid) to authenticated;
grant execute on function public.mark_opportunity(uuid, text, numeric) to authenticated;
grant execute on function public.resolve_ingest_token(text) to service_role;
