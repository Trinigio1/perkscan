-- Money owed: real price drops on things you bought.
-- Direct product links (on stores with price-adjustment policies, tracking removed) are kept from the email
-- and copied to its receipt; the daily scout reads those product pages while the store's window is open.
alter table public.inbound_messages
  add column if not exists product_links text[] not null default '{}';
alter table public.receipts
  add column if not exists product_links text[] not null default '{}';
alter table public.receipts
  add column if not exists price_checked_at timestamptz;
