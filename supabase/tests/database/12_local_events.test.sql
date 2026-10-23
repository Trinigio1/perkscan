-- Coming up near you: the events catalog is read-only and every event has an official source.
begin;
select plan(5);

insert into auth.users (id, email) values ('abababab-0000-0000-0000-000000000001', 'eve@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select throws_ok(
  $$insert into public.local_events (id, title, summary, category, countries, starts_on, ends_on, url, status, source_url, last_verified)
    values ('x', 'X', 's', 'bank_promo', array['TT'], '2026-12-01', '2026-12-31', 'https://x.example', 'expected', 'https://x.example', '2026-10-23')$$,
  '23514', null, 'an expected event must say what it is based on');
select throws_ok(
  $$insert into public.local_events (id, title, summary, category, countries, starts_on, ends_on, url, status, source_url, last_verified)
    values ('y', 'Y', 's', 'free_day', array['US'], '2026-12-31', '2026-12-01', 'https://y.example', 'confirmed', 'https://y.example', '2026-10-23')$$,
  '23514', null, 'an event can''t end before it starts');
select throws_ok(
  $$insert into public.local_events (id, title, summary, category, countries, starts_on, ends_on, url, status, source_url, last_verified)
    values ('z', 'Z', 's', 'free_day', array['US'], '2026-12-01', '2026-12-01', 'https://z.example', 'confirmed', 'http://z.example', '2026-10-23')$$,
  '23514', null, 'sources must be https');

insert into public.local_events (id, title, summary, category, countries, starts_on, ends_on, url, status, source_url, last_verified)
values ('test_event', 'Free day', 's', 'free_day', array['US'], '2026-11-11', '2026-11-11', 'https://e.example', 'confirmed', 'https://e.example', '2026-10-23');
select pg_temp.act_as('abababab-0000-0000-0000-000000000001');
select ok((select count(*) from public.local_events where id = 'test_event') = 1, 'signed-in users can read events');
select throws_ok($$update public.local_events set title = 'Mine' where id = 'test_event'$$, '42501', null, 'but can''t change them');

select * from finish();
rollback;
