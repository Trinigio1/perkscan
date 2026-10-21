-- Phase 3: currencies and automatic credit marking.
begin;
select plan(14);

insert into public.cards (id, issuer, product_name, country, currency) values ('tt_card', 'Test Bank TT', 'TT Card', 'TT', 'TTD');
insert into public.card_benefits (id, card_id, type, name, amount, period, currency, status) values
  ('tt_card__usd_credit', 'tt_card', 'credit', 'US$ credit', 10, 'monthly', 'USD', 'TODO_VERIFY'),
  ('tt_card__ttd_credit', 'tt_card', 'credit', 'TT$ credit', 50, 'monthly', null, 'TODO_VERIFY');
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'erin@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
select lives_ok($$ update public.profiles set country = 'TT', home_currency = 'TTD' $$, 'users can set country and home currency');
select throws_ok($$ update public.profiles set home_currency = 'us$' $$, '23514', null, 'currency must be a 3-letter uppercase code');
select lives_ok($$ insert into public.user_cards (card_id, last_four) values ('tt_card', '1111') $$, 'add TT card');

select is((select currency::text from public.opportunities where benefit_id = 'tt_card__usd_credit'), 'USD',
  'a benefit stated in US$ keeps US$ on a TT$ card');
select is((select currency::text from public.opportunities where benefit_id = 'tt_card__ttd_credit'), 'TTD',
  'other benefits use the card currency');

select public.mark_credit_used((select id from public.opportunities where benefit_id = 'tt_card__ttd_credit'), false, 20);
select is((select currency::text from public.recovered), 'TTD', 'recovered money keeps the credit''s currency');

select throws_ok(format($$ select public._auto_mark_credit_used(%L, 5) $$,
  (select id from public.opportunities where benefit_id = 'tt_card__usd_credit')), '42501', null, 'users cannot call the auto-mark function');

-- Server side (service role / postgres)
reset role;
select ok(public._auto_mark_credit_used((select id from public.opportunities where benefit_id = 'tt_card__usd_credit'), 4),
  'auto-mark records a partial use');
select is((select marked_by::text || ':' || amount_used from public.benefit_usage where benefit_id = 'tt_card__usd_credit'), 'auto:4.00',
  'marked as auto with the amount');
select ok(public._auto_mark_credit_used((select id from public.opportunities where benefit_id = 'tt_card__usd_credit'), 9),
  'a second receipt adds up');
select is((select status::text from public.opportunities where benefit_id = 'tt_card__usd_credit'), 'claimed',
  'credit is claimed once the total reaches its value');
select is((select amount from public.recovered r join public.opportunities o on o.id = r.opportunity_id where o.benefit_id = 'tt_card__usd_credit'),
  10::numeric, 'recovered is capped at the credit value');

-- User-marked usage is never overridden
select ok(not public._auto_mark_credit_used((select id from public.opportunities where benefit_id = 'tt_card__ttd_credit'), 30),
  'auto-mark leaves user-marked credits alone');
select is((select amount_used from public.benefit_usage where benefit_id = 'tt_card__ttd_credit'), 20::numeric, 'user amount unchanged');

select * from finish();
rollback;
