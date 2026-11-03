-- Money moves: savings you confirm, only for yourself; repeating ones count every month they run; the team
-- report counts them as found. Recalls are public reading, written only by the scout.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777777', 'moves-a@example.com'),
  ('88888888-8888-8888-8888-888888888888', 'moves-b@example.com');
update public.profiles set onboarded_at = null;
update public.profiles set onboarded_at = '2026-09-01' where id in ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');
select lives_ok($$ select public.confirm_saving('phone_insurance:verizon', 'phone_insurance', 'Dropped Verizon Mobile Protect', 17, 'USD', 'month') $$, 'you confirm a saving');
select lives_ok($$ select public.confirm_saving('rental_waiver:hertz-1203', 'rental_waiver', 'Declined the Hertz waiver', 84.5, 'USD', 'once') $$, 'and a one-off');
select is((select count(*)::int from public.savings), 2, 'you see your savings');
select throws_ok($$ insert into public.savings (user_id, key, kind, title, amount, per) values (auth.uid(), 'other:x', 'other', 'x', 1, 'once') $$, '42501', null, 'never written directly');
select throws_ok($$ select public.confirm_saving('bad key!', 'other', 'x', 5, 'USD', 'once') $$, '23514', null, 'keys are checked');
select throws_ok($$ select public.confirm_saving('other:huge', 'other', 'x', 999999, 'USD', 'once') $$, '23514', null, 'amounts are bounded');
select throws_ok($$ insert into public.product_recalls (id, recall_date, title, url) values ('x', current_date, 'x', 'https://x.example') $$, '42501', null, 'recalls are written only by the scout');

select pg_temp.act_as('88888888-8888-8888-8888-888888888888');
select is((select count(*)::int from public.savings), 0, 'nobody sees anyone else''s savings');

-- Back-date them (as the owner of the test) and read the report.
reset role;
select set_config('request.jwt.claims', '', true);
update public.savings set started_on = '2026-09-15' where key = 'phone_insurance:verizon';
update public.savings set started_on = '2026-10-20' where key = 'rental_waiver:hertz-1203';
select is((public._value_report('2026-10-01')->'found_by_perkscan'->>'mean')::numeric, 50.75, 'October: the monthly saving and the one-off, across two people ((17 + 84.50) / 2)');
select is((public._value_report('2026-11-01')->'found_by_perkscan'->>'mean')::numeric, 8.50, 'November: only the repeating one keeps counting');
select is((public._value_report('2026-10-01')->'found_by_type'), '{"saved:rental_waiver": 84.50, "saved:phone_insurance": 17.00}'::jsonb, 'found money by kind');

update public.savings set ended_on = '2026-10-31' where key = 'phone_insurance:verizon';
select is((public._value_report('2026-11-01')->'found_by_perkscan'->>'mean')::numeric, 0.00, 'a saving that stopped stops counting');

select * from finish();
rollback;
