-- Memberships: Amazon Prime, Costco, Walmart+, a phone plan… Things people belong to come with perks
-- and credits just like cards do, so they live in the same catalog (cards.kind = 'membership') and use
-- the same benefits, credit tracking, reminders and "Worth the fee?". A membership has no card number.

alter table public.cards add column kind text not null default 'card' check (kind in ('card', 'membership'));

alter table public.user_cards alter column last_four drop not null;
-- A membership is added once; a card once per last-4 (the existing unique key).
create unique index user_cards_one_membership on public.user_cards (user_id, card_id) where last_four is null;

-- Cards need their last 4 digits; memberships never have any.
create function public._user_card_digits() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
begin
  select kind into k from public.cards where id = new.card_id;
  if k = 'membership' and new.last_four is not null then
    raise exception 'Memberships have no card number' using errcode = '23514';
  elsif k is distinct from 'membership' and new.last_four is null then
    raise exception 'Enter the card''s last 4 digits' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger user_cards_digits before insert or update of card_id, last_four on public.user_cards
for each row execute function public._user_card_digits();
