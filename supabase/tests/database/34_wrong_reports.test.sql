-- "This is wrong": only your own reports, through the function; the team sees aggregates only.
begin;
select plan(7);
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'wrong-a@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'wrong-b@example.com');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select public.report_wrong('subscription', 'kfc|TTD', 'does_not_apply') $$, 'you report a wrong subscription');
select lives_ok($$ select public.report_wrong('perk', 'u1:amex_gold__hertz_status', 'not_mine', 'My card doesn''t have this', 'amex_gold__hertz_status') $$, 'and a perk your card doesn''t have');
select throws_ok($$ select public.report_wrong('perk', 'x', 'because') $$, '23514', null, 'reasons are checked');
select throws_ok($$ insert into public.wrong_reports (user_id, kind, item_key, reason) values (auth.uid(), 'other', 'x', 'other') $$, '42501', null, 'never written directly');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select public.report_wrong('perk', 'u9:amex_gold__hertz_status', 'not_mine', null, 'amex_gold__hertz_status');
select is((select count(*)::int from public.wrong_reports), 1, 'you only see your own');
select throws_ok($$ select public._quality_report(30) $$, '42501', null, 'the team report is not for users');
reset role;
select set_config('request.jwt.claims', '', true);
select is((public._quality_report(30)->'catalog'->0->>'people')::int, 2, 'the team sees a catalog entry two people reported, not who');
select * from finish();
rollback;
