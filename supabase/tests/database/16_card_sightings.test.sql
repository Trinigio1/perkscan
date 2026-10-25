-- Cards spotted in email: written only by the reader, seen only by their owner, "Not mine" sticks.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('abababab-0000-0000-0000-000000000001', 'k1@example.com'),
  ('abababab-0000-0000-0000-000000000002', 'k2@example.com');

-- The reader (service role) records cards; the same card seen again is counted, not duplicated.
select public._record_card_sighting('abababab-0000-0000-0000-000000000001', 'Chase', 'Freedom Unlimited', '4821', null);
select public._record_card_sighting('abababab-0000-0000-0000-000000000001', 'Chase', 'Freedom Unlimited', '4821', null);
select public._record_card_sighting('abababab-0000-0000-0000-000000000001', 'Chase', '', '4821', null);
select public._record_card_sighting('abababab-0000-0000-0000-000000000001', 'American Express', '', '1007', null);
select is((select times_seen from public.card_sightings where user_id = 'abababab-0000-0000-0000-000000000001' and issuer = 'Chase' and product = 'Freedom Unlimited'), 2, 'seeing a card again counts it once more');
select throws_ok($$insert into public.card_sightings (user_id, issuer, product, last_four) values ('abababab-0000-0000-0000-000000000001', 'Chase', '', '')$$, '23514', null, 'a card needs a name or its last 4 digits');
select throws_ok($$insert into public.card_sightings (user_id, issuer, last_four) values ('abababab-0000-0000-0000-000000000001', 'Chase', '4111111111111111')$$, '23514', null, 'never more than 4 digits');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('abababab-0000-0000-0000-000000000002');
select is((select count(*)::int from public.card_sightings), 0, 'nobody else sees your cards');
select throws_ok($$select public.dismiss_card_sighting((select id from public.card_sightings limit 1))$$, 'P0002', null, 'or can hide them');
select throws_ok($$select public._record_card_sighting('abababab-0000-0000-0000-000000000002', 'Chase', 'X', '1111', null)$$, '42501', null, 'users can''t write sightings themselves');
select throws_ok($$insert into public.card_sightings (user_id, issuer, last_four) values (auth.uid(), 'Chase', '1111')$$, '42501', null, 'not even directly');

select pg_temp.act_as('abababab-0000-0000-0000-000000000001');
select is((select count(*)::int from public.card_sightings), 3, 'you see the cards in your email');
select lives_ok($$select public.dismiss_card_sighting((select id from public.card_sightings where issuer = 'Chase' and product = ''))$$, '"Not mine" works');
select is((select count(*)::int from public.card_sightings where issuer = 'Chase' and dismissed_at is null), 0, 'and hides every sighting of that Chase card ending 4821');
select is((select count(*)::int from public.card_sightings where dismissed_at is null), 1, 'but not your other cards');

reset role;
select is(public.opportunity_category_for('travel_credit'), 'store_credit_gift_cards'::public.opportunity_category, 'travel credits count like store credit');

select * from finish();
rollback;
