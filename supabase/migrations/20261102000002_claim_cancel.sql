-- "Didn't use it": forget the claim (so PerkScan stops asking) but keep the item open.
create function public.cancel_claim(p_opportunity_id uuid) returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.opportunities;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.opportunities
  set claim_started_at = null, claim_check_after = null
  where id = p_opportunity_id and user_id = auth.uid()
  returning * into o;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return o;
end;
$$;
revoke all on function public.cancel_claim(uuid) from public, anon;
grant execute on function public.cancel_claim(uuid) to authenticated;
