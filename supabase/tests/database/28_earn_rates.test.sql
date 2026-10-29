-- Earn rates: catalog anyone signed in can read, nobody can change from the app; points get a cash value only with a source.
begin;
select plan(5);
insert into auth.users (id, email) values ('d2d2d2d2-0000-0000-0000-000000000001', 'e1@example.com');
select throws_ok($$insert into public.card_rewards (card_id, kind, cents_per_unit, last_verified) values ('amex_green', 'points', 2, current_date) on conflict (card_id) do update set cents_per_unit = 2, value_basis = null, value_source_url = null$$, '23514', null, 'a points value needs its source');
select is((select cents_per_unit from public.card_rewards where card_id = 'amex_gold'), 0.60::numeric, 'Amex points at the 0.6¢ Amex states');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;
select pg_temp.act_as('d2d2d2d2-0000-0000-0000-000000000001');
select ok((select count(*) from public.card_earn_rates where card_id = 'boa_premium_rewards') = 3, 'signed-in users read the rates');
select throws_ok($$insert into public.card_earn_rates (card_id, category, rate, source_url, last_verified) values ('amex_gold', 'dining', 20, 'https://x.example', current_date)$$, '42501', null, 'nobody adds rates from the app');
select throws_ok($$update public.card_rewards set cents_per_unit = 5 where card_id = 'amex_gold'$$, '42501', null, 'or changes a value');
select * from finish();
rollback;
