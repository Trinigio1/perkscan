-- Deals for you: read-only catalog, per-user feedback, reports hide a deal, and public codes
-- only appear once enough different opted-in people received them.
begin;
select plan(21);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000001', 'd1@example.com'),
  ('dddddddd-0000-0000-0000-000000000002', 'd2@example.com'),
  ('dddddddd-0000-0000-0000-000000000003', 'd3@example.com'),
  ('dddddddd-0000-0000-0000-000000000004', 'd4@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;

insert into public.deal_sources (id, name, kind, url, countries, categories, merchants)
values ('test_courts', 'Courts', 'store', 'https://courts.example', array['TT'], array['home', 'electronics'], array['courts']);

select throws_ok(
  $$insert into public.deals (dedupe_key, source, source_id, merchant, title, category, countries, url, confidence)
    values ('k1', 'official', 'test_courts', 'Courts', 'Sale', 'home', array['TT'], 'https://courts.example', 'confirmed')$$,
  '23514', null, 'an official deal must quote its evidence');
select throws_ok(
  $$insert into public.deals (dedupe_key, source, source_id, merchant, title, category, countries, url, evidence, confidence)
    values ('k2', 'official', 'test_courts', 'Courts', 'Sale', 'gadgets', array['TT'], 'https://courts.example', 'Sale', 'confirmed')$$,
  '23514', null, 'categories come from the fixed list');
select throws_ok(
  $$insert into public.deals (dedupe_key, source, source_id, merchant, title, category, countries, url, evidence, confidence)
    values ('k3', 'official', 'test_courts', 'Courts', 'Sale', 'home', array['TT'], 'http://courts.example', 'Sale', 'confirmed')$$,
  '23514', null, 'links must be https');

insert into public.deals (id, dedupe_key, source, source_id, merchant, title, category, amount, currency, countries, ends_on, url, evidence, confidence)
values ('dddddddd-1111-0000-0000-000000000001', 'official:test_courts:1', 'official', 'test_courts', 'Courts', 'TT$300 off appliances', 'home', 300, 'TTD', array['TT'], current_date + 5, 'https://courts.example', 'TT$300 off appliances', 'confirmed');

select pg_temp.act_as('dddddddd-0000-0000-0000-000000000001');
select ok((select count(*) from public.deals where dedupe_key = 'official:test_courts:1') = 1, 'signed-in users can read deals');
select throws_ok($$update public.deals set title = 'Mine'$$, '42501', null, 'but can''t change them');
select throws_ok($$insert into public.deal_feedback (deal_id, action) values ('dddddddd-1111-0000-0000-000000000001', 'saved')$$, '42501', null, 'feedback only through the function');
select throws_ok($$insert into public.deal_sightings (user_id, country, merchant, merchant_key, code, offer_key, title) values (auth.uid(), 'TT', 'X', 'x1', 'ABC', 'ABC', 'X')$$, '42501', null, 'sightings are only written by the email reader');
select throws_ok($$select public._promote_shared_deals()$$, '42501', null, 'or run the internal jobs');

-- Profile: interests from the fixed list.
select lives_ok($$update public.profiles set interests = array['home', 'dining'], region = 'FL', share_deals = true where id = auth.uid()$$, 'you can set interests, state and sharing');
select throws_ok($$update public.profiles set interests = array['crypto'] where id = auth.uid()$$, '23514', null, 'only known interests');

-- Saving makes a reminder in Money, once.
select isnt((select public.deal_feedback('dddddddd-1111-0000-0000-000000000001', 'saved')), null, 'saving creates an item');
select is((select public.deal_feedback('dddddddd-1111-0000-0000-000000000001', 'saved')), null, 'saving twice does nothing');
select is((select count(*)::int from public.opportunities where dedupe_key = 'deal:confirmed:dddddddd-1111-0000-0000-000000000001'), 1, 'one item, carrying the deal''s confidence');
select is((select value_estimate from public.opportunities where dedupe_key like 'deal:%'), 300.00, 'with the stated amount');

-- Three different people saying it didn't work hides it for everyone.
select public.deal_feedback('dddddddd-1111-0000-0000-000000000001', 'didnt_work');
select public.deal_feedback('dddddddd-1111-0000-0000-000000000001', 'didnt_work');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000002');
select public.deal_feedback('dddddddd-1111-0000-0000-000000000001', 'didnt_work');
select ok((select count(*) from public.deals where dedupe_key = 'official:test_courts:1') = 1, 'two reports: still shown');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000003');
select public.deal_feedback('dddddddd-1111-0000-0000-000000000001', 'didnt_work');
select ok((select count(*) from public.deals where dedupe_key = 'official:test_courts:1') = 0, 'three people: hidden');

-- Shared codes: published at three opted-in people, never from one.
select pg_temp.as_admin();
update public.profiles set share_deals = true where id in ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000003');
insert into public.deal_sightings (user_id, country, merchant, merchant_key, code, offer_key, title, amount, currency, ends_on) values
  ('dddddddd-0000-0000-0000-000000000001', 'TT', 'Courts', 'courts', 'SAVE50', 'SAVE50', 'TT$50 off', 50, 'TTD', current_date + 10),
  ('dddddddd-0000-0000-0000-000000000002', 'TT', 'Courts', 'courts', 'SAVE50', 'SAVE50', 'TT$50 off', 50, 'TTD', current_date + 10),
  ('dddddddd-0000-0000-0000-000000000001', 'TT', 'Courts', 'courts', 'BDAY-ANNA', 'BDAY-ANNA', 'Birthday gift', 25, 'TTD', current_date + 10),
  -- Not sharing: doesn't count.
  ('dddddddd-0000-0000-0000-000000000004', 'TT', 'Courts', 'courts', 'SAVE50', 'SAVE50', 'TT$50 off', 50, 'TTD', current_date + 10);
select public._promote_shared_deals();
select is((select count(*)::int from public.deals where source = 'shared'), 0, 'two sharing people: not public yet');
insert into public.deal_sightings (user_id, country, merchant, merchant_key, code, offer_key, title, amount, currency, ends_on) values
  ('dddddddd-0000-0000-0000-000000000003', 'TT', 'Courts', 'courts', 'SAVE50', 'SAVE50', 'TT$50 off', 50, 'TTD', current_date + 10);
select public._promote_shared_deals();
select is((select code from public.deals where source = 'shared'), 'SAVE50', 'three sharing people: published, with the category from the store');
select is((select count(*)::int from public.deals where code = 'BDAY-ANNA'), 0, 'a code one person got stays private');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000002');
select is((select count(*)::int from public.deal_sightings), 1, 'you can see only your own sightings');
select pg_temp.as_admin();

update public.profiles set share_deals = false where id = 'dddddddd-0000-0000-0000-000000000003';
select public._promote_shared_deals();
select is((select count(*)::int from public.deals where source = 'shared'), 0, 'turning sharing off removes their sightings and the deal');

select * from finish();
rollback;
