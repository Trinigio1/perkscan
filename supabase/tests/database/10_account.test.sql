-- Settings: deleting an account removes everything; forwarding ids can be regenerated.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000001', 'ola@example.com'),
  ('dddddddd-0000-0000-0000-000000000002', 'pat@example.com');
insert into public.cards (id, issuer, product_name) values ('acct_card', 'Bank', 'Card');
insert into public.card_benefits (id, card_id, type, name, period, status) values ('acct_card__credit', 'acct_card', 'credit', 'Credit', 'monthly', 'TODO_VERIFY');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

-- Give user 1 something in every table that holds user data.
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000001');
insert into public.user_cards (card_id, last_four) values ('acct_card', '1234');
select public.create_ingest_token('Gmail') is not null as token_created;
insert into public.user_perks (title) values ('Mine');
reset role;
insert into public.inbound_messages (id, user_id, source, raw_body, parse_status) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'email', 'x', 'parsed');
insert into public.receipts (user_id, merchant) values ('dddddddd-0000-0000-0000-000000000001', 'Shop');
insert into public.opportunities (id, user_id, type, title, value_estimate, source_message_id, dedupe_key) values
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'promo', 'Promo', 5, 'eeeeeeee-0000-0000-0000-000000000001', 'acct:1');
insert into public.recovered (user_id, opportunity_id, amount) values ('dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 5);
insert into public.ai_usage (user_id, message_id, model, input_tokens, output_tokens, cost_usd) values
  ('dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'm', 1, 1, 0);
insert into public.parse_feedback (user_id, message_id, verdict) values ('dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'right');
insert into public.student_offers (id, name, provider, category, summary, eligibility, how_to_verify, url) values
  ('acct_offer', 'O', 'P', 'other', 's', 'e', 'h', 'https://example.com');
insert into public.student_offer_claims (user_id, offer_id) values ('dddddddd-0000-0000-0000-000000000001', 'acct_offer');

-- Forwarding id
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000001');
create temp table before_fwd as select forwarding_address from public.profiles;
create temp table after_fwd as select public.regenerate_forwarding_address() as v;
select isnt((select v from after_fwd), (select forwarding_address from before_fwd), 'regenerating gives a new forwarding id');
select is((select forwarding_address from public.profiles), (select v from after_fwd), 'and saves it on your profile');
reset role;
select isnt((select forwarding_address from public.profiles where id = 'dddddddd-0000-0000-0000-000000000002'), null, 'other users keep theirs');

-- Delete the account (what the account function does with the service role)
delete from auth.users where id = 'dddddddd-0000-0000-0000-000000000001';
select is((
  select (select count(*) from public.profiles where id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.user_cards where user_id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.benefit_usage where user_id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.opportunities where user_id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.recovered where user_id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.receipts where user_id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.inbound_messages where user_id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.ingest_tokens where user_id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.ai_usage where user_id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.parse_feedback where user_id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.student_offer_claims where user_id = 'dddddddd-0000-0000-0000-000000000001')
       + (select count(*) from public.user_perks where user_id = 'dddddddd-0000-0000-0000-000000000001')
  )::int, 0, 'deleting the account leaves nothing behind in any table');
select is((select count(*)::int from public.profiles where id = 'dddddddd-0000-0000-0000-000000000002'), 1, 'other accounts are untouched');

select * from finish();
rollback;
