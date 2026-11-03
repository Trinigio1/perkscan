-- "Did you already know?": only you answer for your own recoveries, and the team's monthly report shows
-- aggregates only, counting as PerkScan's just what people said they didn't know about.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'found-a@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'found-b@example.com');
-- Only these two people in the report (everyone else is set aside inside this rolled-back test).
update public.profiles set onboarded_at = null;
update public.profiles set onboarded_at = '2026-10-01' where id in ('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666');

insert into public.opportunities (id, user_id, type, title, value_estimate, currency, status, created_at, dedupe_key) values
  ('a0000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'price_drop', 'Price drop', 70, 'USD', 'open', '2026-11-05', 'price_adjust:x'),
  ('a0000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'refund', 'Refund', 40, 'USD', 'open', '2026-11-06', 'refund:y'),
  ('a0000000-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555', 'refund', 'Maybe a double charge', 500, 'USD', 'open', '2026-11-07', 'double_charge:z'),
  ('a0000000-0000-0000-0000-000000000004', '66666666-6666-6666-6666-666666666666', 'promo', 'Old offer', 25, 'USD', 'open', '2026-09-01', 'promo:old');
insert into public.recovered (id, user_id, opportunity_id, amount, currency, recovered_at) values
  ('b0000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'a0000000-0000-0000-0000-000000000001', 70, 'USD', '2026-11-10'),
  ('b0000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'a0000000-0000-0000-0000-000000000002', 40, 'USD', '2026-11-11');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
select lives_ok($$ select public.answer_knew_before('b0000000-0000-0000-0000-000000000001', false) $$, 'you answer for your own recovery');
select is((select knew_before from public.recovered where id = 'b0000000-0000-0000-0000-000000000001'), false, 'the answer is kept');
select throws_ok($$ update public.recovered set knew_before = false $$, '42501', null, 'never written directly');
select throws_ok($$ update public.profiles set plan = 'plus' $$, '42501', null, 'the app cannot set its own plan');
select throws_ok($$ select public._value_report('2026-11-01') $$, '42501', null, 'users cannot run the team report');

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
select throws_ok($$ select public.answer_knew_before('b0000000-0000-0000-0000-000000000001', true) $$, 'P0002', null, 'nobody answers for someone else');

reset role;
select set_config('request.jwt.claims', '', true);
select is((public._value_report('2026-11-01')->>'users')::int, 2, 'report counts onboarded people');
select is((public._value_report('2026-11-01')->'found_by_perkscan'->>'mean')::numeric, 35.00, 'only what people said they didn''t know counts as found (70 across 2 people)');
select is((public._value_report('2026-11-01')->'new_by_type'), '{"refund": 40.00, "price_drop": 70.00}'::jsonb, 'new value this month leaves out guesses and older items');
select is((public._value_report('2026-11-01')->'answers'), '{"knew": 0, "found": 1, "unanswered": 1}'::jsonb, 'answers are tallied');
select is((public._value_report('2026-11-01')->>'users_found_at_least_plan')::int, 1, 'people whose found money beat the plan price');

select * from finish();
rollback;
