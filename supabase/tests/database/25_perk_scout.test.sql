-- Perk scout: held perks and store checks are private to the service; only people approve amounts.
begin;
select plan(6);

insert into auth.users (id, email) values ('cfcfcfcf-0000-0000-0000-000000000001', 'p1@example.com');
insert into public.perk_candidates (id, country, store_key, name, provider, summary, how_to, url, evidence)
values ('scout_us_test', 'US', 'teststore', 'Test Rewards', 'Test', 'Free to join. $5 off.', 'Join.', 'https://www.test.example/rewards', 'It is free to join.');

select throws_ok($$insert into public.perk_programs (id, kind, name, provider, summary, how_to, url, origin) values ('x', 'free_perk', 'X', 'X', 's', 'h', 'https://x.example', 'robot')$$, '23514', null, 'origin is catalog or scout');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;
select pg_temp.act_as('cfcfcfcf-0000-0000-0000-000000000001');
select throws_ok($$select count(*) from public.perk_candidates$$, '42501', null, 'users can''t see held perks');
select throws_ok($$select count(*) from public.perk_store_checks$$, '42501', null, 'or which stores were looked up');
select throws_ok($$select public.review_perk_candidate('scout_us_test', true)$$, '42501', null, 'or approve one');
select throws_ok($$select * from public._perk_store_candidates(5)$$, '42501', null, 'or list stores people buy from');

reset role;
select is(public.review_perk_candidate('scout_us_test', false), 'rejected', 'the service can reject one');

select * from finish();
rollback;
