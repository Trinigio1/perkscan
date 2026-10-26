-- Percent-off codes: keep the percent and any minimum spend as numbers, so the app can estimate
-- what a code is worth from what the user usually spends at that store (shown as "≈", never added
-- to Ready to use). Older offers have the percent only in their description; fill it from there.
alter table public.opportunities
  add column percent_off numeric check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  add column min_spend numeric check (min_spend is null or min_spend >= 0);

update public.opportunities
set percent_off = (substring(description from '(\d{1,2})% off'))::numeric
where percent_off is null
  and type = 'promo'
  and description ~ '(^|\s)\d{1,2}% off'
  and (substring(description from '(\d{1,2})% off'))::numeric between 1 and 90;
