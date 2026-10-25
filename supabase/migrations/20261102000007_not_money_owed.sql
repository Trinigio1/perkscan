-- Trade-in offers ("up to $1,200 when you trade in your iPhone") and other "up to" ceilings were
-- read from emails as money owed. They aren't: keep the items, drop their amounts.
-- The email reader now does the same for new emails (notMoneyOwed in _shared/inbox/opportunities.ts).
update public.opportunities
set value_estimate = null
where source_message_id is not null
  and status in ('open', 'expired')
  and value_estimate is not null
  and type not in ('card_credit', 'protection')
  and (coalesce(title, '') || ' ' || coalesce(description, '')) ~* '(\mtrade[- ]?in\M|\mup to\M|\mfinanc(e|ing)\M|\msweepstakes\M|\mchance to win\M)';
