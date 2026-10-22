-- Two new kinds of money owed: refunds (a cancelled flight, a double charge) and
-- use-it-or-lose-it benefits (an FSA balance, a work allowance, a birthday reward).
-- Enum values must be committed before they're used, so they get their own migration.
alter type public.opportunity_type add value if not exists 'refund';
alter type public.opportunity_type add value if not exists 'benefit';
alter type public.opportunity_category add value if not exists 'refunds';
alter type public.opportunity_category add value if not exists 'benefits';
