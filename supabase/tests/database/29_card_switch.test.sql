-- Switching a saved card to another product: unused credits from the old product go, used ones stay.
begin;
select plan(5);

insert into public.cards (id, issuer, product_name, annual_fee, status) values
  ('sw_basic', 'Test Bank', 'Test Rewards', 95, 'TODO_VERIFY'),
  ('sw_elite', 'Test Bank', 'Test Rewards Elite', 550, 'TODO_VERIFY');
insert into public.card_benefits (id, card_id, type, name, amount, period, period_anchor, status) values
  ('sw_basic__air', 'sw_basic', 'credit', 'Airline credit', 100, 'annual', 'calendar', 'TODO_VERIFY'),
  ('sw_basic__used', 'sw_basic', 'credit', 'Monthly credit', 10, 'monthly', 'calendar', 'TODO_VERIFY'),
  ('sw_elite__air', 'sw_elite', 'credit', 'Airline credit', 300, 'annual', 'calendar', 'TODO_VERIFY'),
  ('sw_elite__life', 'sw_elite', 'credit', 'Lifestyle credit', 150, 'annual', 'calendar', 'TODO_VERIFY');
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'switch@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

insert into public.user_cards (card_id, last_four) values ('sw_basic', '6042');
select public.mark_credit_used((select id from public.opportunities where benefit_id = 'sw_basic__used'), true);

select lives_ok($$ update public.user_cards set card_id = 'sw_elite' where last_four = '6042' $$,
  'a saved card can be switched to another product');
select is((select count(*)::int from public.opportunities where benefit_id = 'sw_basic__air'), 0,
  'the old card''s unused credit is gone');
select is((select count(*)::int from public.opportunities where benefit_id = 'sw_basic__used'), 1,
  'a credit already used stays, with its recovered money');
select is((select count(*)::int from public.opportunities where benefit_id like 'sw_elite__%'), 2,
  'the new card''s credits appear');
select is((select value_estimate from public.opportunities where benefit_id = 'sw_elite__air'), 300::numeric,
  'with the new card''s amounts');

select * from finish();
rollback;
