-- "Did you use it?" answered by your receipts. The reader now records what was taken off each order
-- (codes, gift cards, credits, rewards). When a receipt shows a code or credit PerkScan found for you,
-- that item is marked used and what it saved goes to Used. When it only shows a discount that might be
-- one of your offers, PerkScan asks instead.

-- What was taken off the order: [{ description, code, amount }]. No card numbers.
alter table public.receipts
  add column if not exists discounts jsonb not null default '[]'::jsonb;

-- Where a "used" came from: the user, or a receipt (and which one).
alter table public.recovered
  add column if not exists marked_by text not null default 'user' check (marked_by in ('user', 'auto')),
  add column if not exists source_receipt_id uuid references public.receipts (id) on delete set null;

-- A discount on a receipt that might be this offer: asked about on Home until answered.
alter table public.opportunities
  add column if not exists used_guess_receipt_id uuid references public.receipts (id) on delete set null,
  add column if not exists used_guess_amount numeric(12, 2) check (used_guess_amount is null or used_guess_amount >= 0),
  add column if not exists used_guess_line text,
  add column if not exists used_guess_declined_at timestamptz;

-- Marks an open item used from a receipt (pipeline only). Never overrides what the user did.
create or replace function public._mark_used_from_receipt(p_opportunity_id uuid, p_amount numeric, p_receipt_id uuid, p_line text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.opportunities;
  r public.receipts;
begin
  select * into o from public.opportunities
  where id = p_opportunity_id and status = 'open' and type <> 'card_credit'
  for update;
  if not found then
    return false;
  end if;
  select * into r from public.receipts where id = p_receipt_id and user_id = o.user_id;
  if not found then
    return false;
  end if;
  if coalesce(p_amount, o.value_estimate, 0) > 0 then
    insert into public.recovered (user_id, opportunity_id, amount, currency, recovered_at, marked_by, source_receipt_id)
    values (o.user_id, o.id, coalesce(p_amount, o.value_estimate), o.currency, coalesce(r.purchase_date::timestamptz, now()), 'auto', r.id)
    on conflict (opportunity_id) do nothing;
  end if;
  update public.opportunities
  set status = 'claimed', used_guess_receipt_id = null, used_guess_amount = null, used_guess_line = null
  where id = o.id;
  return true;
end;
$$;
revoke execute on function public._mark_used_from_receipt(uuid, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public._mark_used_from_receipt(uuid, numeric, uuid, text) to service_role;

-- "Did you use this on your Oct 20 Uber Eats order?" Yes marks it used with what the receipt showed;
-- No clears the question and stops asking about receipts up to now.
create or replace function public.answer_used_guess(p_opportunity_id uuid, p_used boolean)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.opportunities;
  r public.receipts;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into o from public.opportunities
  where id = p_opportunity_id and user_id = auth.uid() and used_guess_receipt_id is not null
  for update;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;

  if p_used then
    select * into r from public.receipts where id = o.used_guess_receipt_id;
    if coalesce(o.used_guess_amount, o.value_estimate, 0) > 0 then
      insert into public.recovered (user_id, opportunity_id, amount, currency, recovered_at, marked_by, source_receipt_id)
      values (o.user_id, o.id, coalesce(o.used_guess_amount, o.value_estimate), o.currency, coalesce(r.purchase_date::timestamptz, now()), 'user', r.id)
      on conflict (opportunity_id) do update set amount = excluded.amount, recovered_at = excluded.recovered_at, source_receipt_id = excluded.source_receipt_id;
    end if;
    update public.opportunities
    set status = 'claimed', used_guess_receipt_id = null, used_guess_amount = null, used_guess_line = null
    where id = o.id returning * into o;
  else
    update public.opportunities
    set used_guess_receipt_id = null, used_guess_amount = null, used_guess_line = null, used_guess_declined_at = now()
    where id = o.id returning * into o;
  end if;
  return o;
end;
$$;
revoke execute on function public.answer_used_guess(uuid, boolean) from public, anon;
grant execute on function public.answer_used_guess(uuid, boolean) to authenticated;
