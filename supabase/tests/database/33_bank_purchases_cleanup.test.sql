-- Taking a bank's purchases back out: only your own, only bank-only ones deleted, email ones kept.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('99999999-9999-9999-9999-999999999991', 'bank-a@example.com'),
  ('99999999-9999-9999-9999-999999999992', 'bank-b@example.com');
insert into public.bank_connections (id, user_id, provider, item_id, institution_name, status, environment) values
  ('c1000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999991', 'plaid', 'item-test', 'First Platypus Bank', 'active', 'sandbox'),
  ('c1000000-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999992', 'plaid', 'item-other', 'Other Bank', 'active', 'production');
insert into public.inbound_messages (id, user_id, source, raw_body) values ('d1000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999991', 'email', 'x');
insert into public.receipts (user_id, merchant, total, currency, purchase_date, kind, bank_txn_id, bank_connection_id, source_message_id) values
  ('99999999-9999-9999-9999-999999999991', 'KFC', 12, 'USD', current_date, 'card_alert', 't1', 'c1000000-0000-0000-0000-000000000001', null),
  ('99999999-9999-9999-9999-999999999991', 'Tectra Inc', 500, 'USD', current_date, 'card_alert', 't2', null, null),
  ('99999999-9999-9999-9999-999999999991', 'Target', 40, 'USD', current_date, 'receipt', 't3', null, 'd1000000-0000-0000-0000-000000000001'),
  ('99999999-9999-9999-9999-999999999991', 'Chipotle', 14, 'USD', current_date, 'receipt', null, null, 'd1000000-0000-0000-0000-000000000001'),
  ('99999999-9999-9999-9999-999999999992', 'United Airlines', 500, 'USD', current_date, 'card_alert', 't9', 'c1000000-0000-0000-0000-000000000002', null);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('99999999-9999-9999-9999-999999999991');
select is(public.remove_bank_purchases('c1000000-0000-0000-0000-000000000001'), 1, 'one connection''s bank-only purchases go');
select is(public.remove_bank_purchases(null), 1, 'purchases from earlier, untraced connections go');
select is((select array_agg(merchant order by merchant) from public.receipts), array['Chipotle', 'Target'], 'email receipts stay');
select is((select bank_txn_id from public.receipts where merchant = 'Target'), null, 'and stop pointing at the bank');
select throws_ok($$ select public.remove_bank_purchases('c1000000-0000-0000-0000-000000000002') $$, 'P0002', null, 'never someone else''s connection');

reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.receipts where merchant = 'United Airlines'), 1, 'another person''s purchases are untouched');
select is((select environment from public.bank_connections where id = 'c1000000-0000-0000-0000-000000000001'), 'sandbox', 'a test bank is marked');

select * from finish();
rollback;
