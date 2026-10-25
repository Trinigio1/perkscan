-- Perks for you: the catalog's new fields, and "I have it" / "Not for me" kept per person.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('cdcdcdcd-0000-0000-0000-000000000001', 'f1@example.com'),
  ('cdcdcdcd-0000-0000-0000-000000000002', 'f2@example.com');

select is((select issuers from public.perk_programs where id = 'bofa_museums_on_us'), array['Bank of America'], 'issuer perks name the bank');
select ok((select 'beauty' = any(interests) from public.perk_programs where id = 'sephora_beauty_insider'), 'store perks carry their interests');
select throws_ok($$insert into public.perk_programs (id, kind, name, provider, summary, how_to, url) values ('x', 'nonsense', 'X', 'X', 's', 'h', 'https://x.example')$$, '23514', null, 'kinds are checked');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('cdcdcdcd-0000-0000-0000-000000000001');
select lives_ok($$insert into public.perk_feedback (program_id, action) values ('sephora_beauty_insider', 'have')$$, '"I have it" is saved');
select lives_ok($$insert into public.perk_feedback (program_id, action) values ('irs_free_file', 'dismissed') on conflict (user_id, program_id) do update set action = excluded.action$$, '"Not for me" too');
select throws_ok($$insert into public.perk_feedback (program_id, action) values ('kanopy', 'love')$$, '23514', null, 'only those two answers');
select throws_ok($$insert into public.perk_feedback (user_id, program_id, action) values ('cdcdcdcd-0000-0000-0000-000000000002', 'kanopy', 'have')$$, '42501', null, 'nobody answers for someone else');

select pg_temp.act_as('cdcdcdcd-0000-0000-0000-000000000002');
select is((select count(*)::int from public.perk_feedback), 0, 'nobody sees anyone else''s answers');

reset role;
set local role anon;
select throws_ok($$select * from public.perk_feedback$$, '42501', null, 'signed-out visitors can''t read them');

select * from finish();
rollback;
