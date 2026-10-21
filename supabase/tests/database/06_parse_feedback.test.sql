-- Accuracy tracking: reviews, corrections, and the summary.
begin;
select plan(17);

insert into auth.users (id, email) values
  ('88888888-8888-8888-8888-888888888888', 'hal@example.com'),
  ('99999999-9999-9999-9999-999999999999', 'ivy@example.com');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

-- What the pipeline wrote for hal: a promo email and a card alert text.
insert into public.inbound_messages (id, user_id, source, parse_status, kind, parser_version) values
  ('a0000000-0000-0000-0000-000000000001', '88888888-8888-8888-8888-888888888888', 'email', 'parsed', 'promo', 'v-test'),
  ('a0000000-0000-0000-0000-000000000002', '88888888-8888-8888-8888-888888888888', 'sms', 'parsed', 'card_alert', 'v-test'),
  ('a0000000-0000-0000-0000-000000000003', '88888888-8888-8888-8888-888888888888', 'email', 'parsed', 'promo', 'v-test');
insert into public.opportunities (id, user_id, type, title, value_estimate, currency, code, expires_at, source_message_id, dedupe_key, action_steps) values
  ('b0000000-0000-0000-0000-000000000001', '88888888-8888-8888-8888-888888888888', 'promo', '$10 off', 10, 'USD', 'SAVE1O', '2099-01-01T23:59:59Z',
   'a0000000-0000-0000-0000-000000000001', 'promo:t:1', '[{"step": "Enter code SAVE1O at checkout."}, {"step": "Expires 2099-01-01."}]'),
  ('b0000000-0000-0000-0000-000000000003', '88888888-8888-8888-8888-888888888888', 'promo', 'Newsletter', null, 'USD', null, '2099-01-01T23:59:59Z',
   'a0000000-0000-0000-0000-000000000003', 'promo:t:3', '[]');
insert into public.receipts (id, user_id, merchant, total, currency, purchase_date, last_four, kind, source_message_id) values
  ('c0000000-0000-0000-0000-000000000002', '88888888-8888-8888-8888-888888888888', 'Uber Eats', 144.51, 'TTD', '2026-10-20', '1111', 'card_alert',
   'a0000000-0000-0000-0000-000000000002');

select pg_temp.act_as('99999999-9999-9999-9999-999999999999');
select throws_ok($$ select public.submit_parse_feedback('a0000000-0000-0000-0000-000000000001', 'right') $$, 'P0002', null,
  'cannot review someone else''s message');

select pg_temp.act_as('88888888-8888-8888-8888-888888888888');
select throws_ok($$ insert into public.parse_feedback (user_id, message_id, verdict) values
  ('88888888-8888-8888-8888-888888888888', 'a0000000-0000-0000-0000-000000000001', 'right') $$, '42501', null,
  'feedback is only written through the function');
select throws_ok($$ select public.submit_parse_feedback('a0000000-0000-0000-0000-000000000001', 'maybe') $$, '22023', null, 'verdict is checked');
select throws_ok($$ select public.submit_parse_feedback('a0000000-0000-0000-0000-000000000001', 'wrong', array['vibes']) $$, '23514', null,
  'wrong fields come from a fixed list');
select throws_ok($$ select public.submit_parse_feedback('a0000000-0000-0000-0000-000000000001', 'wrong', array['code'], '{"code": "x y"}') $$, '22023', null,
  'corrections are validated');
select throws_ok($$ select public.submit_parse_feedback('a0000000-0000-0000-0000-000000000001', 'wrong', array['other'], '{"raw_text": "hi"}') $$, '22023', null,
  'only known fields can be corrected (no free text stored there)');

-- Fix the code and amount on the promo
select lives_ok($$ select public.submit_parse_feedback('a0000000-0000-0000-0000-000000000001', 'wrong', array['code', 'amount'],
  '{"code": "SAVE10", "amount": 15}', null, 'b0000000-0000-0000-0000-000000000001') $$, 'submit a correction');
select is((select code || ':' || value_estimate from public.opportunities where id = 'b0000000-0000-0000-0000-000000000001'), 'SAVE10:15.00',
  'the offer is fixed');
select is((select action_steps->0->>'step' from public.opportunities where id = 'b0000000-0000-0000-0000-000000000001'), 'Enter code SAVE10 at checkout.',
  'the steps show the corrected code');
select is((select parser_version from public.parse_feedback where message_id = 'a0000000-0000-0000-0000-000000000001'), 'v-test',
  'feedback records which reader version was checked');

-- Fix the card on the alert: the card link is cleared so re-matching can redo it
select lives_ok($$ select public.submit_parse_feedback('a0000000-0000-0000-0000-000000000002', 'wrong', array['card'],
  '{"last_four": "2222"}', 'card digits were misread', null, 'c0000000-0000-0000-0000-000000000002') $$, 'correct a purchase');
select is((select last_four::text from public.receipts where id = 'c0000000-0000-0000-0000-000000000002'), '2222', 'the purchase is fixed');

-- "Not a real offer" dismisses it
select lives_ok($$ select public.submit_parse_feedback('a0000000-0000-0000-0000-000000000003', 'wrong', array['not_real'], '{}', null,
  'b0000000-0000-0000-0000-000000000003') $$, 'flag a non-offer');
select is((select status::text from public.opportunities where id = 'b0000000-0000-0000-0000-000000000003'), 'dismissed', 'non-offers are dismissed');

-- Changing your mind updates the same review
select lives_ok($$ select public.submit_parse_feedback('a0000000-0000-0000-0000-000000000003', 'right') $$, 'review again');
select is((select public.my_parse_accuracy() - 'by_version'),
  '{"read": 3, "checked": 3, "right": 1, "wrong": 2, "fields": {"code": 1, "amount": 1, "card": 1}}'::jsonb, 'accuracy summary');

select pg_temp.act_as('99999999-9999-9999-9999-999999999999');
select is((select count(*)::int from public.parse_feedback), 0, 'other users cannot see your reviews');

select * from finish();
rollback;
