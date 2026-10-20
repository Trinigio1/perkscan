-- Phase 2: ingest tokens, forwarding ids, dedupe, and mark_opportunity.
begin;
select plan(20);

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'carol@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'dave@example.com');

select matches((select forwarding_address from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  '^u_[0-9a-f]{10}$', 'new users get a forwarding id');
select isnt((select forwarding_address from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  (select forwarding_address from public.profiles where id = '44444444-4444-4444-4444-444444444444'), 'forwarding ids are unique');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

-- Tokens -----------------------------------------------------------------------
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
create temp table tok as select public.create_ingest_token('Gmail') as t;
grant select on tok to authenticated, postgres;
select matches((select t from tok), '^psk_[0-9a-f]{64}$', 'token has the expected shape');
select is((select count(*)::int from public.ingest_tokens), 1, 'carol sees her token row');
select throws_ok($$ select token_hash from public.ingest_tokens $$, '42501', null, 'the hash is never readable');
select throws_ok($$ select public.resolve_ingest_token('x') $$, '42501', null, 'users cannot resolve tokens');

reset role;
select is(public.resolve_ingest_token((select t from tok)), '33333333-3333-3333-3333-333333333333'::uuid,
  'service role resolves the token to its owner');
select is(public.resolve_ingest_token('psk_wrong'), null, 'a wrong token resolves to nobody');
select ok((select last_used_at is not null from public.ingest_tokens where user_id = '33333333-3333-3333-3333-333333333333'),
  'last_used_at is recorded');

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select throws_ok(format($$ select public.revoke_ingest_token(%L) $$,
  (select id from public.ingest_tokens where user_id = '33333333-3333-3333-3333-333333333333')),
  'P0002', null, 'dave cannot revoke carol''s token');

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok(format($$ select public.revoke_ingest_token(%L) $$,
  (select id from public.ingest_tokens limit 1)), 'carol can revoke her token');
reset role;
select is(public.resolve_ingest_token((select t from tok)), null, 'a revoked token stops working');

-- Dedupe ------------------------------------------------------------------------
insert into public.inbound_messages (user_id, source, external_id) values ('33333333-3333-3333-3333-333333333333', 'email', 'gmail-1');
select throws_ok($$ insert into public.inbound_messages (user_id, source, external_id)
  values ('33333333-3333-3333-3333-333333333333', 'email', 'gmail-1') $$, '23505', null, 'the same email is stored once');

insert into public.opportunities (user_id, type, title, value_estimate, expires_at, dedupe_key, code)
values ('33333333-3333-3333-3333-333333333333', 'promo', '$20 off', 20, now() + interval '10 days', 'promo:acme:SAVE20', 'SAVE20');
select is((select category::text from public.opportunities where dedupe_key = 'promo:acme:SAVE20'), 'promos', 'promos land in the Promos category');

-- mark_opportunity ---------------------------------------------------------------
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select is((select status::text from public.mark_opportunity((select id from public.opportunities where dedupe_key = 'promo:acme:SAVE20'), 'used')),
  'claimed', 'using a promo claims it');
select is((select amount from public.recovered), 20::numeric, 'and records what it was worth');
select is((select status::text from public.mark_opportunity((select id from public.opportunities where dedupe_key = 'promo:acme:SAVE20'), 'reopen')),
  'open', 'reopen undoes it');
select is((select count(*)::int from public.recovered), 0, 'and removes the recovered amount');
select is((select status::text from public.mark_opportunity((select id from public.opportunities where dedupe_key = 'promo:acme:SAVE20'), 'dismiss')),
  'dismissed', 'dismiss hides it');

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select throws_ok(format($$ select public.mark_opportunity(%L, 'used') $$,
  (select id from public.opportunities where user_id = '33333333-3333-3333-3333-333333333333' limit 1)),
  'P0002', null, 'dave cannot mark carol''s offers');

select * from finish();
rollback;
