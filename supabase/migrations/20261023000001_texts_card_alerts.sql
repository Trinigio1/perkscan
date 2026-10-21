-- Phase 4: text messages and bank card alerts.

-- A receipt is either a store's receipt or a bank's card purchase alert. An alert
-- and the store receipt for the same purchase are merged into one row by the
-- pipeline, so purchases are never counted twice.
alter table public.receipts
  add column kind text not null default 'receipt' check (kind in ('receipt', 'card_alert')),
  -- An authorization the bank hasn't settled yet ("PENDING" in the alert).
  add column pending boolean not null default false;

-- Lookup used when merging: same user, amount and currency, nearby dates.
create index receipts_merge_idx on public.receipts (user_id, currency, total, purchase_date);
