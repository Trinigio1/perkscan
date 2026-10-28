-- "Did you use it?" from receipts: only you answer about your own offers; No stops the question.
begin;
select plan(6);
insert into auth.users (id, email) values ('ddddeeee-0000-0000-0000-000000000001', 'u1@example.com'), ('ddddeeee-0000-0000-0000-000000000002', 'u2@example.com');
insert into public.receipts (id, user_id, merchant, total, currency, purchase_date) values
  ('ddddeeee-1111-0000-0000-000000000001', 'ddddeeee-0000-0000-0000-000000000001', 'Promo Mart', 40, 'USD', '2026-10-20');
insert into public.opportunities (id, user_id, type, title, status, dedupe_key, currency, used_guess_receipt_id, used_guess_amount, used_guess_line) values
  ('ddddeeee-2222-0000-0000-000000000001', 'ddddeeee-0000-0000-0000-000000000001', 'promo', '$5 off', 'open', 't:a', 'USD', 'ddddeeee-1111-0000-0000-000000000001', 5, 'Promotion'),
  ('ddddeeee-2222-0000-0000-000000000002', 'ddddeeee-0000-0000-0000-000000000001', 'promo', '10% off', 'open', 't:b', 'USD', 'ddddeeee-1111-0000-0000-000000000001', 3, 'Promotion');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('ddddeeee-0000-0000-0000-000000000002');
select throws_ok($$select public.answer_used_guess('ddddeeee-2222-0000-0000-000000000001', true)$$, 'P0002', null, 'nobody else can answer about your offers');

select pg_temp.act_as('ddddeeee-0000-0000-0000-000000000001');
select is((select status::text from public.answer_used_guess('ddddeeee-2222-0000-0000-000000000002', false)), 'open', 'No keeps it to use');
select ok((select used_guess_receipt_id is null and used_guess_declined_at is not null from public.opportunities where id = 'ddddeeee-2222-0000-0000-000000000002'), 'No clears the question and remembers it');
select is((select status::text from public.answer_used_guess('ddddeeee-2222-0000-0000-000000000001', true)), 'claimed', 'Yes marks it used');
select is((select amount from public.recovered where opportunity_id = 'ddddeeee-2222-0000-0000-000000000001'), 5.00::numeric, 'with what the receipt took off, dated by the order');
select throws_ok($$select public._mark_used_from_receipt('ddddeeee-2222-0000-0000-000000000002', 1, 'ddddeeee-1111-0000-0000-000000000001', 'x')$$, '42501', null, 'only the reader marks used from a receipt');

select * from finish();
rollback;
