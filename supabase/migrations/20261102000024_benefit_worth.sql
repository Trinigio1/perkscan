-- What a perk with no stated amount is worth, by the provider's own figure or the price of the same
-- thing bought on its own ("Amazon puts Grubhub+ with Prime at a $120 value a year"). Only set with the
-- provider's own source; shown next to the perk and in Home's "Save up to" as card & membership perks.
alter table public.card_benefits
  add column if not exists worth numeric(10, 2) check (worth is null or worth >= 0),
  add column if not exists worth_period text check (worth_period in ('year', 'use')),
  add column if not exists worth_basis text,
  add column if not exists worth_source_url text,
  add constraint card_benefits_worth_sourced check (
    worth is null or (worth_period is not null and worth_basis is not null and worth_source_url is not null)
  );

update public.card_benefits
set worth = 120,
    worth_period = 'year',
    worth_basis = 'Amazon puts Grubhub+ with Prime at a $120 value a year',
    worth_source_url = 'https://www.aboutamazon.com/news/retail/amazon-prime-grubhub'
where id = 'amazon_prime__grubhub_plus';
