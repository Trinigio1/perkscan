-- Bank connection: you see your own connections and accounts (names, last four), never a token,
-- the sync cursor or anyone else's.
begin;
select plan(8);
insert into auth.users (id, email) values ('d1d1d1d1-0000-0000-0000-000000000001', 'k1@example.com'), ('d1d1d1d1-0000-0000-0000-000000000002', 'k2@example.com');
insert into public.bank_connections (id, user_id, provider, item_id, institution_name, cursor) values
  ('d1d1d1d1-1111-0000-0000-000000000001', 'd1d1d1d1-0000-0000-0000-000000000001', 'plaid', 'item-a', 'Bank of America', 'cur-a'),
  ('d1d1d1d1-1111-0000-0000-000000000002', 'd1d1d1d1-0000-0000-0000-000000000002', 'plaid', 'item-b', 'Chase', 'cur-b');
insert into public.bank_secrets (connection_id, access_token) values ('d1d1d1d1-1111-0000-0000-000000000001', 'v1:iv:ct');
insert into public.bank_accounts (connection_id, account_id, user_id, name, mask, type) values ('d1d1d1d1-1111-0000-0000-000000000001', 'acc', 'd1d1d1d1-0000-0000-0000-000000000001', 'Premium Rewards', '6042', 'credit');

select throws_ok($$insert into public.bank_secrets (connection_id, access_token) values ('d1d1d1d1-1111-0000-0000-000000000002', 'access-sandbox-plain')$$, '23514', null, 'tokens are only stored encrypted');
select throws_ok($$insert into public.bank_accounts (connection_id, account_id, user_id, name, mask) values ('d1d1d1d1-1111-0000-0000-000000000002', 'x', 'd1d1d1d1-0000-0000-0000-000000000002', 'Card', '4111111111111111')$$, '23514', null, 'never a full card number');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;
select pg_temp.act_as('d1d1d1d1-0000-0000-0000-000000000001');
select is((select count(*)::int from public.bank_connections where institution_name is not null), 1, 'you see your own connection only');
select throws_ok($$select cursor from public.bank_connections$$, '42501', null, 'not the sync cursor');
select throws_ok($$select * from public.bank_secrets$$, '42501', null, 'never a token');
select throws_ok($$select * from public.bank_link_sessions$$, '42501', null, 'or link sessions');
select is((select mask from public.bank_accounts), '6042', 'your accounts: last four only');
select throws_ok($$insert into public.bank_connections (user_id, provider, item_id) values ('d1d1d1d1-0000-0000-0000-000000000001', 'plaid', 'item-z')$$, '42501', null, 'connections are only made by the server');

select * from finish();
rollback;
