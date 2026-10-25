-- Simplifying PerkScan around what you already have: "Help people nearby find deals" is retired.
-- It surfaced other people's codes rather than yours, and only worked at scale.
-- Stop the jobs, delete what was shared, switch everyone off and stop new opt-ins.
-- (Store discovery from sender domains, k >= 3, is separate and keeps running.)
select cron.unschedule(jobname) from cron.job where jobname in ('perkscan-shared-deals', 'perkscan-store-stats');

delete from public.deals where source = 'shared';
delete from public.deal_sightings;
delete from public.store_stats;
delete from public.store_pairs;
update public.profiles set share_deals = false where share_deals;

revoke update (share_deals) on public.profiles from authenticated;
