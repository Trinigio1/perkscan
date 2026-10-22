-- Phase 5: student offer claims and settlement matching.
begin;
select plan(16);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'jo@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'kim@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

insert into public.student_offers (id, name, provider, category, summary, eligibility, how_to_verify, url, countries)
values ('test_offer', 'Test offer', 'Test', 'software', 'Free thing', 'Students', 'School email', 'https://example.com/student', '{}');

-- Settlements (server side)
insert into public.settlements (id, name, description, eligible_merchants, eligible_products, purchase_start, purchase_end,
  claim_deadline, claim_url, proof_required, eligible_countries, payout_note, status, source_url, last_verified) values
  ('widget_battery', 'Widget Battery Settlement', 'About batteries.', array['acme outfitters', 'courts'], 'Widget batteries.',
   '2026-01-01', '2026-12-31', current_date + 30, 'https://claims.example.com', 'A receipt.', '{}', 'Up to US$20.', 'active',
   'https://claims.example.com/notice', '2026-10-22'),
  ('us_only', 'US Only Settlement', 'US residents.', array['courts'], 'Anything.', '2026-01-01', '2026-12-31',
   current_date + 30, 'https://us.example.com', 'None.', array['US'], null, 'active', 'https://us.example.com/notice', '2026-10-22'),
  ('too_late', 'Expired Settlement', 'Past deadline.', array['courts'], 'Anything.', '2026-01-01', '2026-12-31',
   current_date - 1, 'https://late.example.com', 'None.', '{}', null, 'active', 'https://late.example.com/notice', '2026-10-22'),
  ('wrong_dates', 'Old Purchases Settlement', 'Old.', array['courts'], 'Anything.', '2019-01-01', '2019-12-31',
   current_date + 30, 'https://old.example.com', 'None.', '{}', null, 'active', 'https://old.example.com/notice', '2026-10-22');

update public.profiles set country = 'TT', home_currency = 'TTD' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.receipts (user_id, merchant, total, currency, purchase_date) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'COURTS TRINIDAD', 2899, 'TTD', '2026-10-20'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Massy Stores', 210, 'TTD', '2026-10-19');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ insert into public.settlements (id, name, description, eligible_merchants, eligible_products, purchase_start, purchase_end,
  claim_deadline, claim_url, proof_required, source_url, last_verified) values ('x', 'x', 'x', array['x'], 'x', '2026-01-01', '2026-01-02',
  '2026-02-01', 'https://x.example.com', 'x', 'https://x.example.com', '2026-10-22') $$, '42501', null, 'users cannot add settlements');
select is((select count(*)::int from public.settlements), 4, 'users can read settlements');

select is(public.sync_my_settlements(), 1, 'one settlement matches (store + dates + country + deadline)');
select is((select count(*)::int from public.opportunities where type = 'settlement'), 1, 'one possible claim created');
select is((select dedupe_key from public.opportunities where type = 'settlement'), 'settlement:widget_battery', 'the right settlement');
select ok((select value_estimate is null from public.opportunities where type = 'settlement'), 'never counted as money owed');
select is((select currency::text from public.opportunities where type = 'settlement'), 'TTD', 'in the user''s home currency');
select ok((select description like 'You bought from COURTS TRINIDAD on 2026-10-20%' from public.opportunities where type = 'settlement'),
  'says which purchase matched');
select is((select action_steps->2->>'url' from public.opportunities where type = 'settlement'), 'https://claims.example.com',
  'links to the official claim site');
select is((select source_receipt_id is not null from public.opportunities where type = 'settlement'), true, 'linked to the receipt');
select is(public.sync_my_settlements(), 1, 'matching again is safe');
select is((select count(*)::int from public.opportunities where type = 'settlement'), 1, 'no duplicate claims');

-- Closing a settlement expires the open match
reset role;
update public.settlements set status = 'closed' where id = 'widget_battery';
select public._match_settlements_for_user('aaaaaaaa-0000-0000-0000-000000000001');
select is((select status::text from public.opportunities where dedupe_key = 'settlement:widget_battery'), 'expired', 'closed settlements expire');

-- Student claims
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ insert into public.student_offer_claims (offer_id) values ('test_offer') $$, 'mark a student offer claimed');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select is((select count(*)::int from public.student_offer_claims), 0, 'other users cannot see your claims');
select throws_ok($$ insert into public.student_offer_claims (user_id, offer_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'test_offer') $$,
  '42501', null, 'cannot claim for someone else');

select * from finish();
rollback;
