-- Sapphire Reserve's Peloton credit is now tracked yearly (Chase: "up to $120 in annual statement
-- credits"), not monthly. Remove the old monthly rows that were never used: they had no amount
-- (the credit was unverified) and the yearly row replaces them on the next sync. January's row
-- shares the yearly period start, so the sync updates it in place.
delete from public.opportunities o
where o.benefit_id = 'chase_sapphire_reserve__peloton'
  and o.type = 'card_credit'
  and o.value_estimate is null
  and o.status in ('open', 'expired')
  and extract(month from o.period_start) <> 1
  and not exists (
    select 1 from public.benefit_usage u
    where u.user_card_id = o.user_card_id and u.benefit_id = o.benefit_id and u.period_start = o.period_start
  )
  and not exists (select 1 from public.recovered r where r.opportunity_id = o.id);
