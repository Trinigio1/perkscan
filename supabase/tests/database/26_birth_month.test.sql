-- Birth month: only a month, only your own.
begin;
select plan(3);
insert into auth.users (id, email) values ('d0d0d0d0-0000-0000-0000-000000000001', 'b1@example.com'), ('d0d0d0d0-0000-0000-0000-000000000002', 'b2@example.com');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;
select pg_temp.act_as('d0d0d0d0-0000-0000-0000-000000000001');
select lives_ok($$update public.profiles set birth_month = 3 where id = 'd0d0d0d0-0000-0000-0000-000000000001'$$, 'you can set your birth month');
select throws_ok($$update public.profiles set birth_month = 13 where id = 'd0d0d0d0-0000-0000-0000-000000000001'$$, '23514', null, 'only 1 to 12');
update public.profiles set birth_month = 5 where id = 'd0d0d0d0-0000-0000-0000-000000000002';
reset role;
select is((select birth_month from public.profiles where id = 'd0d0d0d0-0000-0000-0000-000000000002'), null, 'nobody sets someone else''s');
select * from finish();
rollback;
