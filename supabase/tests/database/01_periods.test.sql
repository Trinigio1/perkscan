-- Period math for card credits. Run with `npx supabase test db`.
begin;
select plan(20);

-- Calendar periods
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('monthly', 'calendar', null, '2026-10-20')),
  '(2026-10-01,2026-11-01)', 'calendar monthly');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('monthly', 'calendar', null, '2026-12-31')),
  '(2026-12-01,2027-01-01)', 'calendar monthly crosses year');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('quarterly', 'calendar', null, '2026-10-20')),
  '(2026-10-01,2027-01-01)', 'calendar Q4');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('quarterly', 'calendar', null, '2026-03-31')),
  '(2026-01-01,2026-04-01)', 'calendar Q1 last day');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('semiannual', 'calendar', null, '2026-06-30')),
  '(2026-01-01,2026-07-01)', 'calendar H1');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('semiannual', 'calendar', null, '2026-07-01')),
  '(2026-07-01,2027-01-01)', 'calendar H2 first day');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('annual', 'calendar', null, '2026-10-20')),
  '(2026-01-01,2027-01-01)', 'calendar annual');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('monthly', 'calendar', null, '2028-02-29')),
  '(2028-02-01,2028-03-01)', 'calendar monthly leap February');

-- Cardmember-year periods
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('annual', 'cardmember_year', '2023-03-15', '2026-03-14')),
  '(2025-03-15,2026-03-15)', 'anniversary: day before renewal');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('annual', 'cardmember_year', '2023-03-15', '2026-03-15')),
  '(2026-03-15,2027-03-15)', 'anniversary: renewal day starts new year');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('annual', 'cardmember_year', '2024-02-29', '2025-02-27')),
  '(2024-02-29,2025-02-28)', 'leap-day open date: first year ends Feb 28');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('annual', 'cardmember_year', '2024-02-29', '2025-02-28')),
  '(2025-02-28,2026-02-28)', 'leap-day open date: non-leap renewal on Feb 28');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('annual', 'cardmember_year', '2024-02-29', '2028-02-29')),
  '(2028-02-29,2029-02-28)', 'leap-day open date: back to Feb 29 in leap year');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('monthly', 'cardmember_year', '2025-01-31', '2026-02-28')),
  '(2026-02-28,2026-03-31)', 'month-end anchor clamps without drifting');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('semiannual', 'cardmember_year', '2025-08-10', '2026-02-09')),
  '(2025-08-10,2026-02-10)', 'cardmember semiannual');
select is((select row(period_start, period_end)::text from public.benefit_period_bounds('annual', 'cardmember_year', null, '2026-10-20')),
  '(2026-01-01,2027-01-01)', 'missing open date falls back to calendar');

-- Not periodic
select ok((select period_start is null from public.benefit_period_bounds('per_claim', 'calendar', null, '2026-10-20')),
  'per_claim has no period');

-- Monthly amount overrides
select is(public.benefit_amount_for_period(15, '{"12": 35}', 'monthly', '2026-12-01'), 35::numeric, 'December override');
select is(public.benefit_amount_for_period(15, '{"12": 35}', 'monthly', '2026-11-01'), 15::numeric, 'no override in November');
select is(public.benefit_amount_for_period(null, null, 'annual', '2026-01-01'), null::numeric, 'unverified amount stays null');

select * from finish();
rollback;
