-- Two more kinds of money people forget: travel credits (airline eCredits, flight credits,
-- travel vouchers) and certificates (free nights, companion fares). Enum values must be committed
-- before they're used, so they get their own migration.
alter type public.opportunity_type add value if not exists 'travel_credit';
alter type public.opportunity_type add value if not exists 'certificate';
