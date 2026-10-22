-- Perks students add from their own school: private to them.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'max@example.com'),
  ('cccccccc-0000-0000-0000-000000000002', 'ned@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('cccccccc-0000-0000-0000-000000000001');
select lives_ok($$ insert into public.user_perks (title, details, url, suggest) values ('Campus bookstore 10% off', 'Show student ID', 'https://example.com/books', true) $$,
  'add a perk from your school');
select throws_ok($$ insert into public.user_perks (title, url) values ('Bad link', 'javascript:alert(1)') $$, '23514', null, 'links must be web links');
select throws_ok($$ insert into public.user_perks (user_id, title) values ('cccccccc-0000-0000-0000-000000000002', 'Not mine') $$, '42501', null,
  'cannot add perks for someone else');
select lives_ok($$ update public.user_perks set suggest = false $$, 'edit your perk');

select pg_temp.act_as('cccccccc-0000-0000-0000-000000000002');
select is((select count(*)::int from public.user_perks), 0, 'other users cannot see your perks');
delete from public.user_perks;
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000001');
select is((select count(*)::int from public.user_perks), 1, 'or delete them');

select * from finish();
rollback;
