-- Offers from email carry what they're about (from the app's list of interests only) and any percent off.
begin;
select plan(5);

insert into auth.users (id, email) values ('efefefef-0000-0000-0000-000000000001', 'i1@example.com');

select lives_ok($$insert into public.opportunities (user_id, type, title, merchant, currency, dedupe_key, interest) values ('efefefef-0000-0000-0000-000000000001', 'promo', 'PT50', 'Iron Gym', 'USD', 't:1', 'fitness')$$, 'an offer can say it''s about fitness');
select lives_ok($$insert into public.opportunities (user_id, type, title, merchant, currency, dedupe_key) values ('efefefef-0000-0000-0000-000000000001', 'promo', 'X', 'Acme', 'USD', 't:2')$$, 'or say nothing');
select throws_ok($$insert into public.opportunities (user_id, type, title, merchant, currency, dedupe_key, interest) values ('efefefef-0000-0000-0000-000000000001', 'promo', 'Y', 'Acme', 'USD', 't:3', 'gyms')$$, '23514', null, 'but only one of the app''s interests');

select lives_ok($$insert into public.opportunities (user_id, type, title, merchant, currency, dedupe_key, percent_off, min_spend) values ('efefefef-0000-0000-0000-000000000001', 'promo', '20% off', 'Nike', 'USD', 't:4', 20, 50)$$, 'a percent off and minimum spend are kept as numbers');
select throws_ok($$insert into public.opportunities (user_id, type, title, merchant, currency, dedupe_key, percent_off) values ('efefefef-0000-0000-0000-000000000001', 'promo', 'X', 'Nike', 'USD', 't:5', 150)$$, '23514', null, 'but never more than 100%');

select * from finish();
rollback;
