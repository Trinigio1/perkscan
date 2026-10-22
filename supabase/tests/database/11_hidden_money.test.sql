-- Hidden money: the programs catalog is read-only, and adding items by hand is checked and private.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('ffffffff-0000-0000-0000-000000000001', 'kai@example.com'),
  ('ffffffff-0000-0000-0000-000000000002', 'lee@example.com');
insert into public.perk_programs (id, kind, name, provider, summary, how_to, url, status) values
  ('test_loyalty', 'loyalty', 'Test Miles', 'Test Air', 'Miles expire.', 'Fly once a year.', 'https://example.com/miles', 'TODO_VERIFY');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

-- Catalog
select throws_ok(
  $$insert into public.perk_programs (id, kind, name, provider, summary, how_to, url, status) values ('x', 'loyalty', 'X', 'X', 's', 'h', 'https://x.example', 'active')$$,
  '23514', null, 'an active program needs a source and a check date');
select throws_ok(
  $$insert into public.perk_programs (id, kind, name, provider, summary, how_to, url) values ('y', 'loyalty', 'Y', 'Y', 's', 'h', 'http://y.example')$$,
  '23514', null, 'program links must be https');

select pg_temp.act_as('ffffffff-0000-0000-0000-000000000001');
select ok((select count(*) from public.perk_programs where id = 'test_loyalty') = 1, 'signed-in users can read the catalog');
select throws_ok($$update public.perk_programs set name = 'Mine' where id = 'test_loyalty'$$, '42501', null, 'but can''t change it');

-- Adding items by hand
create temp table added as
select public.add_my_item('points', '12,000 Test Miles', 'Test Air', 12000, null, current_date + 30, 'test_loyalty', 'Ask about the family pool') as id;
select is((select type::text from public.opportunities where id = (select id from added)), 'points', 'points are added');
select is((select value_estimate from public.opportunities where id = (select id from added)), null, 'points have no cash value, so they never inflate totals');
select is((select category::text from public.opportunities where id = (select id from added)), 'points_miles', 'and land in points & miles');
select ok((select action_steps::text like '%Ask about the family pool%Fly once a year%' from public.opportunities where id = (select id from added)),
  'your note and the program''s how-to become the steps');

select ok(public.add_my_item('benefit', 'FSA balance', null, 250, 'USD', current_date + 60) is not null, 'a use-it-or-lose-it benefit is added');
select is((select category::text from public.opportunities where title = 'FSA balance'), 'benefits', 'refunds and benefits have their own categories');

select throws_ok($$select public.add_my_item('card_credit', 'Sneaky credit', null, 100)$$, '22023', null, 'card credits can''t be added by hand');
select throws_ok($$select public.add_my_item('refund', 'Old refund', null, 10, 'USD', current_date - 10)$$, '22023', null, 'a date that has passed is refused');

-- Privacy: other users can't see or delete it
select pg_temp.act_as('ffffffff-0000-0000-0000-000000000002');
select public.remove_my_item((select id from added));
select is((select count(*) from public.opportunities where title like '%Test Miles')::int, 0, 'other users can''t see your items');
reset role;
select is((select count(*) from public.opportunities where id = (select id from added))::int, 1, 'or delete them');

select * from finish();
rollback;
