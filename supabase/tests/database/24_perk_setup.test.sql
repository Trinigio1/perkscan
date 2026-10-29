-- Perks to turn on: "Done" / "Not for me" kept per person, only for their own cards.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('cececece-0000-0000-0000-000000000001', 's1@example.com'),
  ('cececece-0000-0000-0000-000000000002', 's2@example.com');
insert into public.user_cards (id, user_id, card_id) values
  ('cececece-1111-0000-0000-000000000001', 'cececece-0000-0000-0000-000000000001', 'amazon_prime'),
  ('cececece-1111-0000-0000-000000000002', 'cececece-0000-0000-0000-000000000002', 'amazon_prime');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('cececece-0000-0000-0000-000000000001');
select lives_ok($$insert into public.perk_setup (user_card_id, benefit_id, status) values ('cececece-1111-0000-0000-000000000001', 'amazon_prime__grubhub_plus', 'done')$$, '"Done" is saved');
select throws_ok($$insert into public.perk_setup (user_card_id, benefit_id, status) values ('cececece-1111-0000-0000-000000000001', 'amazon_prime__prime_video', 'maybe')$$, '23514', null, 'only done or skipped');
select throws_ok($$insert into public.perk_setup (user_card_id, benefit_id, status) values ('cececece-1111-0000-0000-000000000002', 'amazon_prime__grubhub_plus', 'done')$$, '42501', null, 'not for someone else''s card');

select pg_temp.act_as('cececece-0000-0000-0000-000000000002');
select is((select count(*)::int from public.perk_setup), 0, 'nobody sees anyone else''s');

reset role;
select is((select count(*)::int from public.perk_setup where user_id = 'cececece-0000-0000-0000-000000000001'), 1, 'kept for its owner');
delete from public.user_cards where id = 'cececece-1111-0000-0000-000000000001';
select is((select count(*)::int from public.perk_setup where user_id = 'cececece-0000-0000-0000-000000000001'), 0, 'removing the card removes its answers');

select * from finish();
rollback;
