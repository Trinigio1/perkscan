-- One purchase, one receipt: order updates and repeat emails about one order are removed.
begin;
select plan(7);
insert into auth.users (id, email) values ('ccccdddd-0000-0000-0000-000000000001', 'd1@example.com');

insert into public.inbound_messages (id, user_id, source, subject) values
  ('ccccdddd-1111-0000-0000-000000000001', 'ccccdddd-0000-0000-0000-000000000001', 'email', 'Your Amazon.com order has been confirmed'),
  ('ccccdddd-1111-0000-0000-000000000002', 'ccccdddd-0000-0000-0000-000000000001', 'email', 'Shipped: "Memory foam mattress"'),
  ('ccccdddd-1111-0000-0000-000000000003', 'ccccdddd-0000-0000-0000-000000000001', 'email', 'Your booking confirmation'),
  ('ccccdddd-1111-0000-0000-000000000004', 'ccccdddd-0000-0000-0000-000000000001', 'email', 'Your e-ticket receipt'),
  ('ccccdddd-1111-0000-0000-000000000005', 'ccccdddd-0000-0000-0000-000000000001', 'email', 'Your Uber Eats order'),
  ('ccccdddd-1111-0000-0000-000000000006', 'ccccdddd-0000-0000-0000-000000000001', 'email', 'Your Uber Eats order');

insert into public.receipts (id, user_id, source_message_id, merchant, total, currency, purchase_date, order_number, created_at) values
  -- the order and its shipped update
  ('ccccdddd-2222-0000-0000-000000000001', 'ccccdddd-0000-0000-0000-000000000001', 'ccccdddd-1111-0000-0000-000000000001', 'Amazon', 89.99, 'USD', '2026-09-01', '112-3344556', now() - interval '3 days'),
  ('ccccdddd-2222-0000-0000-000000000002', 'ccccdddd-0000-0000-0000-000000000001', 'ccccdddd-1111-0000-0000-000000000002', 'Amazon', 89.99, 'USD', '2026-09-03', null, now() - interval '2 days'),
  -- one booking, two emails, same booking reference
  ('ccccdddd-2222-0000-0000-000000000003', 'ccccdddd-0000-0000-0000-000000000001', 'ccccdddd-1111-0000-0000-000000000003', 'Caribbean Airlines', 669.23, 'USD', '2026-08-10', 'XKQ7PL', now() - interval '3 days'),
  ('ccccdddd-2222-0000-0000-000000000004', 'ccccdddd-0000-0000-0000-000000000001', 'ccccdddd-1111-0000-0000-000000000004', 'Caribbean Airlines', 669.23, 'USD', '2026-08-11', 'xkq-7pl', now() - interval '2 days'),
  -- two real orders, same amount and day, different order numbers: both stay
  ('ccccdddd-2222-0000-0000-000000000005', 'ccccdddd-0000-0000-0000-000000000001', 'ccccdddd-1111-0000-0000-000000000005', 'Uber Eats', 22.10, 'USD', '2026-09-05', 'UE-100001', now() - interval '3 days'),
  ('ccccdddd-2222-0000-0000-000000000006', 'ccccdddd-0000-0000-0000-000000000001', 'ccccdddd-1111-0000-0000-000000000006', 'Uber Eats', 22.10, 'USD', '2026-09-05', 'UE-100002', now() - interval '2 days');

insert into public.opportunities (user_id, type, title, status, dedupe_key, source_receipt_id)
values ('ccccdddd-0000-0000-0000-000000000001', 'promo', 'Copy protection', 'open', 'test:copy', 'ccccdddd-2222-0000-0000-000000000004');

select cmp_ok(public._dedupe_receipts(), '>=', 2, 'copies removed');
select ok(not exists (select 1 from public.receipts where id = 'ccccdddd-2222-0000-0000-000000000002'), 'a shipped update is not a receipt');
select ok(exists (select 1 from public.receipts where id = 'ccccdddd-2222-0000-0000-000000000001'), 'the order confirmation stays');
select is((select count(*)::int from public.receipts where user_id = 'ccccdddd-0000-0000-0000-000000000001' and merchant = 'Caribbean Airlines'), 1, 'one booking, one receipt');
select is((select count(*)::int from public.receipts where user_id = 'ccccdddd-0000-0000-0000-000000000001' and merchant = 'Uber Eats'), 2, 'separate orders stay separate');
select is((select status::text from public.opportunities where dedupe_key = 'test:copy'), 'dismissed', 'items from a removed copy are dismissed');

set local role authenticated;
select throws_ok($$select public._dedupe_receipts()$$, '42501', null, 'not callable from the app');

select * from finish();
rollback;
