-- Memberships: added without a card number, once each; cards still need their last 4; credits flow.
begin;
select plan(7);

insert into auth.users (id, email) values ('cdcdcdcd-0000-0000-0000-000000000001', 'm1@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;
select pg_temp.act_as('cdcdcdcd-0000-0000-0000-000000000001');

select lives_ok($$insert into public.user_cards (card_id) values ('costco_executive')$$, 'a membership is added without a card number');
select throws_ok($$insert into public.user_cards (card_id) values ('costco_executive')$$, '23505', null, 'and only once');
select throws_ok($$insert into public.user_cards (card_id, last_four) values ('walmart_plus', '1234')$$, '23514', null, 'memberships never take card digits');
select throws_ok($$insert into public.user_cards (card_id) values ('amex_gold')$$, '23514', null, 'cards still need their last 4 digits');
select lives_ok($$insert into public.user_cards (card_id, last_four) values ('amex_gold', '4242')$$, 'cards with digits are fine');

-- The Costco Executive monthly same-day delivery credit shows up like a card credit.
select public.sync_my_card_credits();
select ok(
  (select count(*) > 0 from public.opportunities o join public.user_cards u on u.id = o.user_card_id
   where u.card_id = 'costco_executive' and o.type = 'card_credit' and o.value_estimate = 10),
  'a membership''s monthly credit is tracked like a card credit');
select is((select count(*)::int from public.user_cards), 2, 'you see your card and your membership');

select * from finish();
rollback;
