-- Phase 4: texts reuse the inbox tables; card alerts are receipts with a kind.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'fay@example.com'),
  ('77777777-7777-7777-7777-777777777777', 'gus@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

-- Server side: what the pipeline writes.
insert into public.inbound_messages (user_id, source, external_id, raw_body)
values ('66666666-6666-6666-6666-666666666666', 'sms', 'sms-2026-10-20-abc', 'Scotiabank alert');
insert into public.receipts (user_id, merchant, total, currency, purchase_date, last_four, kind, pending)
values ('66666666-6666-6666-6666-666666666666', 'Uber Eats', 144.51, 'TTD', '2026-10-20', '0000', 'card_alert', true);

select throws_ok($$ insert into public.inbound_messages (user_id, source, external_id, raw_body)
  values ('66666666-6666-6666-6666-666666666666', 'sms', 'sms-2026-10-20-abc', 'again') $$,
  '23505', null, 'the same text arriving twice is stored once');
select throws_ok($$ insert into public.receipts (user_id, merchant, kind) values ('66666666-6666-6666-6666-666666666666', 'X', 'statement') $$,
  '23514', null, 'receipt kind is receipt or card_alert');
select is((select kind || ':' || pending from public.receipts where user_id = '66666666-6666-6666-6666-666666666666'), 'card_alert:true', 'alerts keep kind and pending');

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
select is((select count(*)::int from public.receipts), 1, 'owner sees their alert');
select is((select count(*)::int from public.inbound_messages where source = 'sms'), 1, 'owner sees their text in the inbox');

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');
select is((select count(*)::int from public.receipts), 0, 'other users cannot see the alert');
select is((select count(*)::int from public.inbound_messages), 0, 'other users cannot see the text');

select * from finish();
rollback;
