-- Deals from the stores people actually buy from. The scout used to look up promotion pages only for
-- stores that email several PerkScan users; now stores on users' receipts come first: the receipt's
-- sender domain, and the store names on receipts (a restaurant ordered through a delivery app). Only
-- a store's domain or name leaves this function — never who bought what — and the scout then reads
-- that store's public promotions page, checking robots.txt like any other page.
create function public._purchase_store_candidates(p_limit int default 10)
returns table (country text, domain text, store_key text, name text, purchases int)
language sql
stable
security definer
set search_path = ''
as $$
  with bought as (
    select p.country, m.from_domain as domain, public.store_key(r.merchant) as merchant_key, r.merchant
    from public.receipts r
    join public.profiles p on p.id = r.user_id
    left join public.inbound_messages m on m.id = r.source_message_id
    where p.country is not null and r.purchase_date > (now() - interval '365 days')::date
  ),
  by_domain as (
    select b.country, b.domain, public.domain_store_key(b.domain) as store_key, mode() within group (order by b.merchant) as name, count(*)::int as purchases
    from bought b where b.domain is not null
    group by b.country, b.domain
  ),
  by_name as (
    -- Store names with no domain of their own here (bought through a delivery app or seen on a card alert).
    select b.country, null::text as domain, b.merchant_key as store_key, mode() within group (order by b.merchant) as name, count(*)::int as purchases
    from bought b where b.merchant_key is not null and length(b.merchant_key) >= 3
    group by b.country, b.merchant_key
  )
  select * from (select * from by_domain union all select * from by_name) c
  where not public._not_a_store(c.store_key)
    and (c.domain is null or not exists (select 1 from public.deal_sources d where c.country = any (d.countries) and d.url ~* ('^https://([a-z0-9-]+\.)*' || replace(c.domain, '.', '\.') || '(/|$)')))
    and (c.domain is null or not exists (select 1 from public.store_domain_checks k where k.domain = c.domain and k.country = c.country and k.checked_at > now() - interval '30 days'))
  order by c.purchases desc
  limit p_limit
$$;
revoke execute on function public._purchase_store_candidates(int) from public, anon, authenticated;
grant execute on function public._purchase_store_candidates(int) to service_role;
