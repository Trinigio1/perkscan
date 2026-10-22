-- Schools: a read-only list; students pick theirs on their profile.
begin;
select plan(5);

insert into auth.users (id, email) values ('bbbbbbbb-0000-0000-0000-000000000001', 'lee@example.com');
insert into public.universities (id, name, short_name, country, source_url, last_verified)
values ('test_uni', 'Test University', 'TU', 'TT', 'https://example.com/list', '2026-10-22');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000001');
select ok((select count(*) from public.universities) >= 1, 'signed-in users can read the school list');
select throws_ok($$ insert into public.universities (id, name, short_name, country, source_url, last_verified)
  values ('x', 'X', 'X', 'TT', 'https://x.example.com', '2026-10-22') $$, '42501', null, 'users cannot add schools');
select lives_ok($$ update public.profiles set university_id = 'test_uni' $$, 'pick your school');
select is((select university_id from public.profiles), 'test_uni', 'saved on your profile');
select throws_ok($$ update public.profiles set university_id = 'no_such_school' $$, '23503', null, 'only real schools');

select * from finish();
rollback;
