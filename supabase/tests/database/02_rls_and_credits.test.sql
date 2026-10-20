-- RLS with two users, plus the card-credit sync and mark-used flow.
-- Run with `npx supabase test db`. Everything is rolled back at the end.
begin;
select plan(37);

-- Fixtures (as postgres) -----------------------------------------------------
insert into public.cards (id, issuer, product_name, annual_fee, status) values
  ('test_card', 'Test Bank', 'Test Card', 100, 'TODO_VERIFY');
insert into public.card_benefits (id, card_id, type, name, amount, period, period_anchor, status) values
  ('test_card__monthly', 'test_card', 'credit', 'Monthly credit', 10, 'monthly', 'calendar', 'TODO_VERIFY'),
  ('test_card__unverified', 'test_card', 'credit', 'Unverified credit', null, 'annual', 'calendar', 'TODO_VERIFY'),
  ('test_card__protection', 'test_card', 'protection', 'Purchase protection', null, 'per_claim', 'calendar', 'TODO_VERIFY');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');

select is((select count(*)::int from public.profiles where id in
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')), 2,
  'signup trigger creates profiles');

-- Helper to act as a user
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  -- Both settings, so this works with current and older auth.uid() implementations.
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

-- Alice --------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select lives_ok($$ insert into public.user_cards (card_id, last_four) values ('test_card', '1234') $$,
  'alice can add a card');
select throws_ok($$ insert into public.user_cards (card_id, last_four) values ('test_card', '12345') $$,
  null, 'last_four must be exactly 4 digits');
select throws_ok($$ insert into public.user_cards (card_id, last_four) values ('test_card', '4111111111111111') $$,
  null, 'full card numbers are rejected');

select is((select count(*)::int from public.opportunities where type = 'card_credit'), 2,
  'adding a card creates one opportunity per periodic credit (not protections)');
select is((select value_estimate from public.opportunities where benefit_id = 'test_card__unverified'), null::numeric,
  'unverified credit has no value');
select ok((select expires_at > now() from public.opportunities where benefit_id = 'test_card__monthly'),
  'current period expires in the future');

select lives_ok($$ select public.sync_my_card_credits() $$, 'sync is callable');
select is((select count(*)::int from public.opportunities), 2, 'sync is idempotent');

select is((select count(*)::int from public.cards where id = 'test_card'), 1, 'catalog is readable');
select throws_ok($$ insert into public.cards (id, issuer, product_name) values ('x', 'x', 'x') $$,
  '42501', null, 'catalog is not writable');
select throws_ok($$ insert into public.opportunities (user_id, type, title) values (auth.uid(), 'promo', 'fake') $$,
  '42501', null, 'opportunities cannot be inserted directly');
select throws_ok($$ insert into public.recovered (user_id, amount) values (auth.uid(), 1000) $$,
  '42501', null, 'recovered cannot be inserted directly');
select throws_ok($$ update public.profiles set forwarding_address = 'x@y.z' $$,
  '42501', null, 'forwarding_address is not user-editable');
select lives_ok($$ update public.profiles set is_student = true, timezone = 'America/New_York' $$,
  'profile fields are editable');
select throws_ok($$ update public.profiles set timezone = 'Mars/Olympus' $$,
  '22023', null, 'invalid time zones are rejected');
select throws_ok($$ select private_hash from (select token_hash as private_hash from public.ingest_tokens) t $$,
  '42501', null, 'token hashes are never readable');
select throws_ok($$ select public._sync_all_card_credits() $$,
  '42501', null, 'internal functions are not callable');

-- Mark used in full while the amount is unverified, then verify the amount.
select is((select status::text from public.mark_credit_used(
  (select id from public.opportunities where benefit_id = 'test_card__unverified'), true)), 'claimed',
  'unverified credit can be marked used');
select is((select amount from public.recovered), 0::numeric, 'unverified credit recovers $0 for now');

-- Partial use on the monthly credit
select is((select status::text from public.mark_credit_used(
  (select id from public.opportunities where benefit_id = 'test_card__monthly'), false, 4)), 'open',
  'partial use keeps the credit open');
select is((select sum(amount) from public.recovered), 4::numeric, 'partial use recovers the partial amount');
select is((select status::text from public.mark_credit_used(
  (select id from public.opportunities where benefit_id = 'test_card__monthly'), true, 25)), 'claimed',
  'full use claims it');
select is((select amount from public.recovered r join public.opportunities o on o.id = r.opportunity_id
  where o.benefit_id = 'test_card__monthly'), 10::numeric, 'recovered is capped at the credit value');

-- Bob ----------------------------------------------------------------------------
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select is((select count(*)::int from public.user_cards), 0, 'bob cannot see alice''s cards');
select is((select count(*)::int from public.opportunities), 0, 'bob cannot see alice''s opportunities');
select is((select count(*)::int from public.recovered), 0, 'bob cannot see alice''s recovered money');
select is((select count(*)::int from public.benefit_usage), 0, 'bob cannot see alice''s usage');
select is((select count(*)::int from public.profiles), 1, 'bob only sees his own profile');
select throws_ok($$ insert into public.user_cards (user_id, card_id, last_four)
  values ('11111111-1111-1111-1111-111111111111', 'test_card', '9999') $$,
  '42501', null, 'bob cannot add a card to alice''s account');
select throws_ok(format($$ select public.mark_credit_used(%L, true) $$,
  (select id from public.opportunities o where o.user_id = '11111111-1111-1111-1111-111111111111' limit 1)),
  'P0002', null, 'bob cannot mark alice''s credits');

-- Anonymous ----------------------------------------------------------------------
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true),
       set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select count(*) from public.cards $$, '42501', null, 'anon cannot read the catalog');
select throws_ok($$ select public.sync_my_card_credits() $$, '42501', null, 'anon cannot call RPCs');

-- Back to postgres: verify the catalog amount and check recovered follows it.
reset role;
update public.card_benefits set amount = 50 where id = 'test_card__unverified';
select public._sync_card_credits_for_user('11111111-1111-1111-1111-111111111111');
select is((select r.amount from public.recovered r join public.opportunities o on o.id = r.opportunity_id
  where o.benefit_id = 'test_card__unverified'), 50::numeric,
  'a credit marked used in full picks up the newly verified amount');

-- A card added ~3 months ago: earlier monthly periods are created and expired.
update public.user_cards set created_at = now() - interval '3 months'
where user_id = '11111111-1111-1111-1111-111111111111';
select public._sync_card_credits_for_user('11111111-1111-1111-1111-111111111111');
select ok((select count(*) from public.opportunities where benefit_id = 'test_card__monthly') >= 3,
  'periods since the card was added are tracked');
select is((select count(*)::int from public.opportunities
  where benefit_id = 'test_card__monthly' and expires_at <= now() and status <> 'expired'), 0,
  'past periods are expired');
select is((select count(*)::int from public.opportunities
  where benefit_id = 'test_card__monthly' and expires_at > now() and status = 'expired'), 0,
  'current period is not expired');

select * from finish();
rollback;
