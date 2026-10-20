-- Accounts created before the signup trigger existed have no profile row, which
-- leaves onboarding unable to save. Create any missing profiles.
insert into public.profiles (id, display_name, forwarding_address)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
       public.new_forwarding_id()
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
