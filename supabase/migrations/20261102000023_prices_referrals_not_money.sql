-- Only money you have counts toward "Ready to use". Two kinds of offers were counted that aren't:
--   - prices: "Broadway's Beaches for $59", "plans from $9.99" (what you'd pay, not what you get)
--   - referral rewards: "Spread the love and get $20 off", "give $20, get $20" (paid only when a friend buys)
-- The reader no longer gives these an amount; this clears the amount on ones already saved. They stay
-- listed (the code may still be useful), just not as money in hand. Anything the user acted on is left alone.
update public.opportunities
set value_estimate = null
where status = 'open'
  and claim_started_at is null
  and value_estimate is not null
  and type in ('promo', 'store_credit')
  and coalesce(dedupe_key, '') not like 'manual:%'
  and (
    -- a price, with no words that make it money off
    (title ~* '\m(for|from|starting at|only|just|now)\s+(US)?\$\s?\d'
     and title !~* '\m(off|credit|back|save|saving|savings|free|reward|cash|gift ?card|voucher|refund|payout|discount)\M')
    -- a referral reward
    or (title || ' ' || coalesce(description, '')) ~* '\m(referrals?|refer (a )?friends?|invite (a )?friends?|spread the love)\M'
    or (title || ' ' || coalesce(description, '')) ~* 'give \$\d+[^.]{0,20}get \$\d+'
  );
