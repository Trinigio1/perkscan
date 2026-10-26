-- "What PerkScan read": why an email gave nothing (already found, expired, no value), written by the reader.
alter table public.inbound_messages add column read_note text;

-- Trade-in offers are never money and not worth showing; rewards for doing something (an interview,
-- a survey, completing tasks) aren't money the user has.
update public.opportunities set status = 'dismissed'
where status = 'open' and type in ('promo', 'store_credit', 'gift_card') and (title ~* '\mtrade[- ]?in\M' or coalesce(description, '') ~* '\mtrade[- ]?in\M');
update public.opportunities set value_estimate = null
where status = 'open' and value_estimate is not null and dedupe_key not like 'manual:%'
  and (title || ' ' || coalesce(description, '')) ~* '\m(interview|survey|focus group|research study|unlock by)\M|\mcomplet(e|ing) [0-9]+ (tasks?|orders?|trips?|rides?)\M';
