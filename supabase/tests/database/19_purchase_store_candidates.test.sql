-- Store pages to look up come first from stores on receipts: the sender domain and the store name.
begin;
select plan(4);

insert into auth.users (id, email) values ('abcdabcd-0000-0000-0000-000000000001', 'b1@example.com');
update public.profiles set country = 'US' where id = 'abcdabcd-0000-0000-0000-000000000001';
insert into public.inbound_messages (id, user_id, source, external_id, from_domain, parse_status)
values ('abcdabcd-0000-0000-0000-0000000000a1', 'abcdabcd-0000-0000-0000-000000000001', 'email', 'x1', 'uber.com', 'parsed');
insert into public.receipts (user_id, kind, merchant, total, currency, purchase_date, source_message_id) values
  ('abcdabcd-0000-0000-0000-000000000001', 'receipt', 'Chipotle Mexican Grill', 23.43, 'USD', current_date - 3, 'abcdabcd-0000-0000-0000-0000000000a1'),
  ('abcdabcd-0000-0000-0000-000000000001', 'receipt', 'Chipotle Mexican Grill', 24.50, 'USD', current_date - 9, 'abcdabcd-0000-0000-0000-0000000000a1'),
  ('abcdabcd-0000-0000-0000-000000000001', 'receipt', 'Gmail', 1, 'USD', current_date - 9, null);

select ok(exists(select 1 from public._purchase_store_candidates(50) where domain = 'uber.com' and purchases = 2), 'the receipt sender is a candidate');
select ok(exists(select 1 from public._purchase_store_candidates(50) where domain is null and store_key = 'chipotlemexicangrill'), 'and the store named on the receipt');
select ok(not exists(select 1 from public._purchase_store_candidates(50) where store_key = 'gmail'), 'never a mail provider or bank');

set local role authenticated;
select throws_ok($$select * from public._purchase_store_candidates(5)$$, '42501', null, 'only the scout can ask');

select * from finish();
rollback;
