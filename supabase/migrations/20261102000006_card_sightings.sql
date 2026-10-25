-- Cards you hold but haven't added: statements, payment notices, card alerts and benefit emails
-- from the issuer show which cards you carry. PerkScan suggests adding them so their perks show up.
-- Only the issuer, the card's name as written and its last 4 digits are kept. Never more.

-- Travel credits count like store credit; certificates sit with points and miles.
-- Compared as text: `supabase db push` runs pending migrations in one transaction, and Postgres
-- won't use enum values added earlier in that same transaction ("unsafe use of new value").
create or replace function public.opportunity_category_for(t public.opportunity_type)
returns public.opportunity_category
language sql immutable parallel safe
set search_path = ''
as $$
  select case t::text
    when 'card_credit'   then 'card_credits'
    when 'protection'    then 'card_protections'
    when 'gift_card'     then 'store_credit_gift_cards'
    when 'store_credit'  then 'store_credit_gift_cards'
    when 'travel_credit' then 'store_credit_gift_cards'
    when 'promo'         then 'promos'
    when 'points'        then 'points_miles'
    when 'certificate'   then 'points_miles'
    when 'settlement'    then 'settlements'
    when 'student'       then 'student'
    when 'return_window' then 'returns_trials'
    when 'price_drop'    then 'returns_trials'
    when 'free_trial'    then 'returns_trials'
    when 'refund'        then 'refunds'
    when 'benefit'       then 'benefits'
  end::public.opportunity_category;
$$;

create table public.card_sightings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  issuer            text not null check (char_length(issuer) between 1 and 60),
  -- The card's name as the email wrote it ("Freedom Unlimited"), or '' if not named.
  product           text not null default '' check (char_length(product) <= 80),
  -- Only the last four digits, or '' if not shown. Never a full card number.
  last_four         text not null default '' check (last_four = '' or last_four ~ '^[0-9]{4}$'),
  check (product <> '' or last_four <> ''),
  source_message_id uuid references public.inbound_messages (id) on delete set null,
  times_seen        int not null default 1,
  first_seen        timestamptz not null default now(),
  last_seen         timestamptz not null default now(),
  -- "Not mine": never suggested again.
  dismissed_at      timestamptz,
  unique (user_id, issuer, product, last_four)
);
create index card_sightings_user_idx on public.card_sightings (user_id);

alter table public.card_sightings enable row level security;
create policy "card sightings: own rows" on public.card_sightings for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.card_sightings from anon, authenticated;

-- Written by the email reader (service role) only.
create function public._record_card_sighting(p_user uuid, p_issuer text, p_product text, p_last_four text, p_message uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.card_sightings as c (user_id, issuer, product, last_four, source_message_id)
  values (p_user, p_issuer, coalesce(p_product, ''), coalesce(p_last_four, ''), p_message)
  on conflict (user_id, issuer, product, last_four) do update
    set times_seen = c.times_seen + 1, last_seen = now(), source_message_id = excluded.source_message_id;
$$;
revoke all on function public._record_card_sighting(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public._record_card_sighting(uuid, text, text, text, uuid) to service_role;

-- "Not mine": hide one spotted card (all rows for the same issuer and last 4, or name when there are no digits).
create function public.dismiss_card_sighting(p_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.card_sightings;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into s from public.card_sightings where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  update public.card_sightings
  set dismissed_at = now()
  where user_id = auth.uid() and issuer = s.issuer
    and (case when s.last_four <> '' then last_four = s.last_four else product = s.product end);
end;
$$;
revoke all on function public.dismiss_card_sighting(uuid) from public, anon;
grant execute on function public.dismiss_card_sighting(uuid) to authenticated;

-- Issuer email domains -> issuer name. Same list as supabase/functions/_shared/inbox/cards.ts.
create function public._issuer_from_domain(p_domain text) returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p_domain ~* '(^|\.)chase\.com$' then 'Chase'
    when p_domain ~* '(^|\.)(americanexpress\.com|aexp\.com|amex\.com)$' then 'American Express'
    when p_domain ~* '(^|\.)capitalone\.com$' then 'Capital One'
    when p_domain ~* '(^|\.)(citi\.com|citibank\.com|citicards\.com)$' then 'Citi'
    when p_domain ~* '(^|\.)discover\.com$' then 'Discover'
    when p_domain ~* '(^|\.)wellsfargo\.com$' then 'Wells Fargo'
    when p_domain ~* '(^|\.)(bankofamerica\.com|bofa\.com)$' then 'Bank of America'
    when p_domain ~* '(^|\.)usbank\.com$' then 'U.S. Bank'
    when p_domain ~* '(^|\.)(barclaycardus\.com|barclays\.com|barclaysus\.com)$' then 'Barclays'
    when p_domain ~* '(^|\.)(synchrony\.com|synchronybank\.com)$' then 'Synchrony'
    when p_domain ~* '(^|\.)scotiabank\.com$' then 'Scotiabank'
    when p_domain ~* '(^|\.)firstcitizenstt\.com$' then 'First Citizens'
    when p_domain ~* '(^|\.)republictt\.com$' then 'Republic Bank'
  end;
$$;

-- Cards already seen: bank alerts PerkScan read before this existed, from a known issuer's domain.
insert into public.card_sightings (user_id, issuer, last_four, source_message_id, times_seen, first_seen, last_seen)
select r.user_id, public._issuer_from_domain(m.from_domain), r.last_four, max(m.id::text)::uuid, count(*), min(r.created_at), max(r.created_at)
from public.receipts r
join public.inbound_messages m on m.id = r.source_message_id
where r.kind = 'card_alert' and r.last_four ~ '^[0-9]{4}$' and public._issuer_from_domain(m.from_domain) is not null
group by r.user_id, public._issuer_from_domain(m.from_domain), r.last_four
on conflict (user_id, issuer, product, last_four) do nothing;
