-- Deals you wouldn't see in your own inbox: code-less shared promotions, "people like you"
-- store statistics (opt-in, 5+ people), and stores to look for.
begin;
select plan(16);

insert into auth.users (id, email)
select ('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'e' || i || '@example.com' from generate_series(1, 7) i;
update public.profiles set country = 'TT', share_deals = true where id::text like 'eeeeeeee-%';
-- Person 7 doesn't share.
update public.profiles set share_deals = false where id = 'eeeeeeee-0000-0000-0000-000000000007';

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

-- Store names
select is(public.store_key('COURTS (TRINIDAD) LTD'), 'courts', 'store names drop company words');
select is(public.domain_store_key('email.courts.co.tt'), 'courts', 'country domains keep the store name');
select is(public.domain_store_key('my.uwi.edu'), null, 'schools and government aren''t stores');

-- Code-less promotions: same store, number and end date from 3 people -> published.
insert into public.deal_sightings (user_id, country, merchant, merchant_key, code, offer_key, title, percent_off, ends_on)
select ('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'TT', 'Massy Stores', 'massystores', null, 'p20:' || (current_date + 5), case i when 1 then '20% off produce' else '20% off fresh produce' end, 20, current_date + 5
from generate_series(1, 3) i;
select throws_ok(
  $$insert into public.deal_sightings (user_id, country, merchant, merchant_key, code, offer_key, title) values ('eeeeeeee-0000-0000-0000-000000000004', 'TT', 'X', 'xstore', null, 'nothing', 'Big sale')$$,
  '23514', null, 'a promotion without a code needs a number and an end date');
select public._promote_shared_deals();
select is((select percent_off from public.deals where dedupe_key like 'shared:TT:massystores:%'), 20.00, 'a promotion many people got is published even without a code');
select is((select code from public.deals where dedupe_key like 'shared:TT:massystores:%'), null, 'with no code');
select is((select title from public.deals where dedupe_key like 'shared:TT:massystores:%'), '20% off fresh produce', 'titled the way most people saw it');

-- Store statistics: only people sharing, only when 5+ have it in common.
insert into public.receipts (user_id, merchant, currency, kind)
select ('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'Uber Eats', 'TTD', 'receipt' from generate_series(1, 7) i;
insert into public.receipts (user_id, merchant, currency, kind)
select ('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'PriceSmart', 'TTD', 'receipt' from generate_series(1, 5) i;
insert into public.receipts (user_id, merchant, currency, kind)
select ('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'Rare Shop', 'TTD', 'receipt' from generate_series(1, 4) i;
insert into public.inbound_messages (user_id, source, from_domain, received_at, parse_status)
select ('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'email', 'gmail.com', now(), 'parsed' from generate_series(1, 6) i;
select public._refresh_store_stats();
select is((select people from public.store_stats where country = 'TT' and store_key = 'ubereats'), 6, 'counts only people who share (6 of 7)');
select is((select count(*)::int from public.store_stats where store_key = 'rareshop'), 0, 'fewer than 5 people: not kept');
select is((select count(*)::int from public.store_stats where store_key = 'gmail'), 0, 'mail providers aren''t stores');
select is((select people from public.store_pairs where store_a = 'ubereats' and store_b = 'pricesmart'), 5, 'stores that go together, both ways');

select pg_temp.act_as('eeeeeeee-0000-0000-0000-000000000007');
select ok((select count(*) from public.store_pairs) > 0, 'anyone can read the statistics (no individuals in them)');
select throws_ok($$select * from public._store_candidates(1, 5)$$, '42501', null, 'but not the store discovery list');
select set_config('role', 'postgres', true);

-- Stores to look for: domains emailing enough people, not already on the list, not checked lately.
insert into public.inbound_messages (user_id, source, from_domain, received_at, parse_status)
select ('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'email', 'newstore.co.tt', now(), 'parsed' from generate_series(1, 3) i;
select is((select store_key from public._store_candidates(3, 10) where domain = 'newstore.co.tt'), 'newstore', 'a store emailing 3+ people is a candidate');
insert into public.store_domain_checks (domain, country, result) values ('newstore.co.tt', 'TT', 'no promotions page');
select is((select count(*)::int from public._store_candidates(3, 10) where domain = 'newstore.co.tt'), 0, 'not checked again for 30 days');
select is((select count(*)::int from public._store_candidates(3, 10) where domain = 'gmail.com'), 0, 'mail providers are never candidates');

select * from finish();
rollback;
