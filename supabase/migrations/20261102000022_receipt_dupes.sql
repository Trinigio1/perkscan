-- One purchase, one receipt. Before this, every store email that repeated an order total was saved
-- as its own receipt: shipped / delivered / delivery-date / on-hold / payment-declined updates, and
-- each email about one booking (confirmation, e-ticket, itinerary). The reader now saves only the
-- confirmation or receipt and merges emails for the same order; this removes the copies already saved.

-- Order number compared loosely: letters and digits only, upper case.
create or replace function public._order_key(n text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(n, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;
revoke execute on function public._order_key(text) from public, anon, authenticated;
grant execute on function public._order_key(text) to service_role;

-- Removes duplicate store receipts (see above) for everyone and returns how many. Run once below.
create or replace function public._dedupe_receipts()
returns integer
language plpgsql
set search_path = ''
as $fn$
declare
  drop_ids uuid[];
  more uuid[];
  removed integer;
begin
  -- 1. Receipts made from order updates (the email's subject says so and isn't a confirmation).
  select coalesce(array_agg(r.id), '{}') into drop_ids
  from public.receipts r
  join public.inbound_messages m on m.id = r.source_message_id
  where r.kind = 'receipt'
    and m.subject ~* '\m(shipped|on (its|the) way|out for delivery|delivered|arriving|delivery (update|date|estimate)|delayed|on hold|payment (was )?(declined|failed)|problem with your (order|payment)|could not be processed|track your (order|package))\M'
    and m.subject !~* '\m(receipt|order confirm|booking confirm|confirmation|thanks for your (order|purchase)|thank you for your (order|purchase))';

  -- 2. Several receipts for the same order number: keep the first one with an amount.
  select coalesce(array_agg(x.id), '{}') into more
  from (
    select r.id,
           row_number() over (partition by r.user_id, public._order_key(r.order_number)
                              order by (r.total is null), r.created_at, r.id) as n
    from public.receipts r
    where r.kind = 'receipt'
      and length(public._order_key(r.order_number)) >= 6
      and r.id <> all (drop_ids)
  ) x
  where x.n > 1;
  drop_ids := drop_ids || more;

  -- 3. Same store, amount and day, with no two different order numbers among them: keep the first.
  with live as (
    select r.* from public.receipts r
    where r.kind = 'receipt' and r.total is not null and r.purchase_date is not null and r.id <> all (drop_ids)
  ), groups as (
    select user_id, lower(merchant) as m, total, currency, purchase_date
    from live
    group by 1, 2, 3, 4, 5
    having count(*) > 1 and count(distinct public._order_key(order_number)) <= 1
  ), ranked as (
    select l.id,
           row_number() over (partition by l.user_id, lower(l.merchant), l.total, l.currency, l.purchase_date
                              order by (l.order_number is null), l.created_at, l.id) as n
    from live l
    join groups g on g.user_id = l.user_id and g.m = lower(l.merchant) and g.total = l.total
                 and g.currency = l.currency and g.purchase_date = l.purchase_date
  )
  select coalesce(array_agg(id), '{}') into more from ranked where n > 1;
  drop_ids := drop_ids || more;

  -- Open items made from a dropped copy (a protection on the same purchase twice) go with it;
  -- anything the user acted on stays.
  update public.opportunities
  set status = 'dismissed'
  where source_receipt_id = any (drop_ids)
    and status = 'open'
    and claim_started_at is null;

  delete from public.receipts where id = any (drop_ids);
  get diagnostics removed = row_count;
  return removed;
end;
$fn$;
revoke execute on function public._dedupe_receipts() from public, anon, authenticated;
grant execute on function public._dedupe_receipts() to service_role;

select public._dedupe_receipts();
