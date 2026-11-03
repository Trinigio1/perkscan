-- Prices behind perk values: a perk's worth follows its price; a reload never rolls a newer price back;
-- users can read prices but not change them, and never see the card check's review queue.
begin;
select plan(10);

insert into public.perk_prices (id, label, label_plural, amount, currency, per, basis, source_url, last_verified) values
  ('t_visit', 'lounge visit', 'lounge visits', 35, 'USD', 'use', 'What a test lounge charges.', 'https://example.com/price', '2026-11-01'),
  ('t_month', 'month', 'months', 8.99, 'USD', 'month', 'A test streaming price.', 'https://example.com/stream', '2026-11-01');
insert into public.cards (id, issuer, product_name, currency, status) values
  ('t_us', 'Test', 'Test US Card', 'USD', 'TODO_VERIFY'),
  ('t_tt', 'Test', 'Test TT Card', 'TTD', 'TODO_VERIFY');
insert into public.card_benefits (id, card_id, type, name, period, period_anchor, status, source_url, last_verified, worth_price_id, worth_units, worth_note) values
  ('t_us__lounges', 't_us', 'perk', 'Lounges', 'per_claim', 'calendar', 'active', 'https://example.com', '2026-11-01', 't_visit', null, null),
  ('t_tt__lounges', 't_tt', 'perk', 'Lounges', 'per_claim', 'calendar', 'active', 'https://example.com', '2026-11-01', 't_visit', 4, 'Needs a premium account.'),
  ('t_us__stream', 't_us', 'perk', 'Streaming', 'per_claim', 'calendar', 'active', 'https://example.com', '2026-11-01', 't_month', null, null);

select results_eq($$ select worth, worth_period from public.card_benefits where id = 't_us__lounges' $$, $$ values (35.00::numeric, 'use'::text) $$, 'a per-use price gives a worth each time');
select is((select worth_basis from public.card_benefits where id = 't_tt__lounges'),
  '4 lounge visits a year × US$35. What a test lounge charges. Needs a premium account.', 'an allowance is counted a year, in the price''s currency, with the note');
select is((select currency from public.card_benefits where id = 't_tt__lounges'), 'USD', 'a US$ price on a TT$ card is valued in US$');
select results_eq($$ select worth, worth_period from public.card_benefits where id = 't_us__stream' $$, $$ values (107.88::numeric, 'year'::text) $$, 'a monthly price is a year of it');

update public.perk_prices set amount = 40 where id = 't_visit';
select is((select worth from public.card_benefits where id = 't_tt__lounges'), 160.00::numeric, 'a new price re-values every perk that uses it');

-- A reload with an older date leaves a newer price alone; a newer one replaces it.
update public.perk_prices set last_verified = '2026-12-01' where id = 't_visit';
insert into public.perk_prices (id, label, label_plural, amount, currency, per, basis, source_url, last_verified) values ('t_visit', 'lounge visit', 'lounge visits', 35, 'USD', 'use', 'What a test lounge charges.', 'https://example.com/price', '2026-11-01')
  on conflict (id) do update set amount = excluded.amount, last_verified = excluded.last_verified
  where perk_prices.last_verified is null or excluded.last_verified >= perk_prices.last_verified;
select is((select amount from public.perk_prices where id = 't_visit'), 40.00::numeric, 'an older reload never rolls a newer price back');

insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'prices@example.com');
insert into public.catalog_changes (kind, card_id, summary, dedupe_key) values ('fee_changed', 't_us', 'Test fee', 'k1');
select set_config('role', 'authenticated', true), set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select ok((select count(*) from public.perk_prices where id like 't\_%') = 2, 'users can read prices');
select throws_ok($$ update public.perk_prices set amount = 1 where id = 't_visit' $$, '42501', null, 'users cannot change prices');
select throws_ok($$ select count(*) from public.catalog_changes $$, '42501', null, 'users never see the card check''s review queue');
select throws_ok($$ update public.card_benefits set worth = 9999 where id = 't_us__lounges' $$, '42501', null, 'users cannot change a perk''s worth');

select * from finish();
rollback;
