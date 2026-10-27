-- Hidden stores are each person's own.
begin;
select plan(4);
insert into auth.users (id, email) values ('aaaabbbb-0000-0000-0000-000000000001', 'h1@example.com'), ('aaaabbbb-0000-0000-0000-000000000002', 'h2@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('aaaabbbb-0000-0000-0000-000000000001');
select lives_ok($$insert into public.store_mutes (store_key, name) values ('uber', 'Uber Eats')$$, 'you can hide a store');
select throws_ok($$insert into public.store_mutes (store_key) values ('Not A Key!')$$, '23514', null, 'store keys are plain');
select throws_ok($$insert into public.store_mutes (user_id, store_key) values ('aaaabbbb-0000-0000-0000-000000000002', 'trip')$$, '42501', null, 'not for someone else');

select pg_temp.act_as('aaaabbbb-0000-0000-0000-000000000002');
select is((select count(*)::int from public.store_mutes), 0, 'nobody sees your hidden stores');

select * from finish();
rollback;
