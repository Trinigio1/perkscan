-- Settings: give the signed-in user a new forwarding id (the old one stops working).
create function public.regenerate_forwarding_address()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.profiles set forwarding_address = public.new_forwarding_id() where id = auth.uid()
  returning forwarding_address into v;
  return v;
end;
$$;
revoke all on function public.regenerate_forwarding_address() from public, anon;
grant execute on function public.regenerate_forwarding_address() to authenticated;
