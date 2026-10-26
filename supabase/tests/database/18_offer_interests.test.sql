-- Offers from email carry what they're about, from the app's list of interests only.
begin;
select plan(3);

insert into auth.users (id, email) values ('efefefef-0000-0000-0000-000000000001', 'i1@example.com');

select lives_ok($$insert into public.opportunities (user_id, type, title, merchant, currency, dedupe_key, interest) values ('efefefef-0000-0000-0000-000000000001', 'promo', 'PT50', 'Iron Gym', 'USD', 't:1', 'fitness')$$, 'an offer can say it''s about fitness');
select lives_ok($$insert into public.opportunities (user_id, type, title, merchant, currency, dedupe_key) values ('efefefef-0000-0000-0000-000000000001', 'promo', 'X', 'Acme', 'USD', 't:2')$$, 'or say nothing');
select throws_ok($$insert into public.opportunities (user_id, type, title, merchant, currency, dedupe_key, interest) values ('efefefef-0000-0000-0000-000000000001', 'promo', 'Y', 'Acme', 'USD', 't:3', 'gyms')$$, '23514', null, 'but only one of the app''s interests');

select * from finish();
rollback;
