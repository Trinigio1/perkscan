-- Claims: started by the user, checked on later, and only theirs.
begin;
select plan(10);

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'c1@example.com'),
  ('cccccccc-0000-0000-0000-000000000002', 'c2@example.com');
insert into public.opportunities (id, user_id, type, title, value_estimate, currency, dedupe_key)
values ('cccccccc-1111-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'price_drop', 'Price drop at Target', 30, 'USD', 'test:claim');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('cccccccc-0000-0000-0000-000000000002');
select throws_ok($$select public.start_claim('cccccccc-1111-0000-0000-000000000001')$$, 'P0002', null, 'nobody else can start your claim');

select pg_temp.act_as('cccccccc-0000-0000-0000-000000000001');
select throws_ok($$select public.snooze_claim_check('cccccccc-1111-0000-0000-000000000001')$$, 'P0002', null, 'nothing to snooze before a claim starts');
select lives_ok($$select public.start_claim('cccccccc-1111-0000-0000-000000000001')$$, 'you can start your claim');
select ok((select claim_started_at is not null and claim_check_after > now() + interval '3 days' from public.opportunities where id = 'cccccccc-1111-0000-0000-000000000001'), 'it remembers when, and checks in a few days later');

-- Starting again keeps the first date.
select is(
  (select (public.start_claim('cccccccc-1111-0000-0000-000000000001')).claim_started_at),
  (select claim_started_at from public.opportunities where id = 'cccccccc-1111-0000-0000-000000000001'),
  'starting twice keeps the first date');

select lives_ok($$select public.snooze_claim_check('cccccccc-1111-0000-0000-000000000001')$$, '"not yet" pushes the check back');

select lives_ok($$select public.cancel_claim('cccccccc-1111-0000-0000-000000000001')$$, '"didn''t use it" forgets the claim');
select ok((select claim_started_at is null and status = 'open' from public.opportunities where id = 'cccccccc-1111-0000-0000-000000000001'), 'and keeps the item open');
select public.start_claim('cccccccc-1111-0000-0000-000000000001');

-- "Yes, it arrived" is the existing mark-as-used, which records the money.
select public.mark_opportunity('cccccccc-1111-0000-0000-000000000001', 'used', 25);
select is((select amount from public.recovered where opportunity_id = 'cccccccc-1111-0000-0000-000000000001'), 25.00, 'what arrived counts as recovered');
select throws_ok($$select public.start_claim('cccccccc-1111-0000-0000-000000000001')$$, 'P0002', null, 'a finished claim can''t be started again');

select * from finish();
rollback;
