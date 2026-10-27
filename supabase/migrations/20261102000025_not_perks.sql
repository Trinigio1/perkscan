-- Not perks at all, so not shown: invitations to apply for a card or open an account, being paid for an
-- interview or survey, and discounts for signing up to texts or emails. The reader now leaves these out;
-- this dismisses the ones already saved. Anything the user acted on is left alone.
update public.opportunities
set status = 'dismissed'
where status = 'open'
  and claim_started_at is null
  and type = 'promo'
  and coalesce(dedupe_key, '') not like 'manual:%'
  and (
    title ~* '\m(apply|applying|application)\M|\mopen (a |an )?(new )?(account|card)\M|\mget approved\M'
    or (title || ' ' || coalesce(description, '')) ~* '\m(interview|survey|focus group|research study|case study)\M'
    or title ~* '\m(sign(ing)? up|connect|subscrib(e|ing)|opt(ing)? in|join)\M[^.]{0,25}\m(texts?|sms|text messages|emails?|newsletter)\M'
  );
