-- Switching a saved card to another product ("Premium Rewards" -> "Premium Rewards Elite"):
-- credits from the old product that were never used go, so the wallet only shows what the new
-- card really has. Credits already marked used stay, with the money recovered from them.
create or replace function public._user_cards_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.open_date is distinct from old.open_date or new.card_id is distinct from old.card_id) then
    delete from public.opportunities o
    where o.user_card_id = new.id
      and o.type = 'card_credit'
      and (new.open_date is distinct from old.open_date
           or not exists (select 1 from public.card_benefits b where b.id = o.benefit_id and b.card_id = new.card_id))
      and not exists (
        select 1 from public.benefit_usage u
        where u.user_card_id = o.user_card_id and u.benefit_id = o.benefit_id and u.period_start = o.period_start
      );
  end if;
  perform public._sync_card_credits_for_user(new.user_id);
  return null;
end;
$$;

revoke execute on function public._user_cards_after_change() from public, anon, authenticated;
