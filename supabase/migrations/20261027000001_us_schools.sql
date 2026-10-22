-- US schools: thousands of rows, so the app searches them instead of loading them all.
alter table public.universities
  add column state         text,
  add column email_domains text[] not null default '{}',   -- e.g. {ufl.edu}; offers verify with these
  add column website       text;

create index universities_country_name_idx on public.universities (country, lower(name));
