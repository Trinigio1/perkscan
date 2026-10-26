-- A paid membership an email shows the user has ("as an Uber One member"), as the reader saw it.
-- Only the membership's name is kept; the app suggests adding it so its perks show up.
alter table public.inbound_messages add column membership_seen text check (char_length(membership_seen) <= 60);
