-- Trust fixes from the first real inbox:
--  * when each email was sent, so in-app deals are dated by the email, not by when PerkScan read it;
--  * "spend $75, save $15" kept as a discount amount, not money in Ready to use;
--  * returns and refunds for returned items, and the connection test's codes, aren't PerkScan's value.
alter table public.inbound_messages add column sent_at timestamptz;
alter table public.opportunities add column discount_amount numeric check (discount_amount is null or discount_amount > 0);

-- Existing offers: a stated amount with a minimum spend is a discount.
update public.opportunities
set discount_amount = value_estimate, value_estimate = null
where type = 'promo' and status = 'open' and value_estimate is not null and min_spend is not null and dedupe_key not like 'manual:%';

update public.opportunities set status = 'dismissed'
where status = 'open' and dedupe_key not like 'manual:%' and (
  type = 'return_window'
  or dedupe_key like 'refund:%'
  or (type = 'refund' and (title ~* '\m(returned|return|refund on its way|refund issued)\M'))
  or merchant ~* 'test shop'
  or source_message_id in (select id from public.inbound_messages where from_domain in ('test-shop.example', 'example'))
  -- In-app deals were dated by when they were read; re-reading dates them by the email.
  or dedupe_key like 'inapp:%'
);
