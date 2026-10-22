-- Students pick their school; offers can be limited to students of particular schools.

create table public.universities (
  id            text primary key,
  name          text not null,
  short_name    text not null,
  country       char(2) not null check (country ~ '^[A-Z]{2}$'),
  source_url    text not null check (source_url like 'https://%'),  -- the official list it comes from
  last_verified date not null,
  sort_order    int not null default 0
);
alter table public.universities enable row level security;
revoke all on public.universities from anon;
revoke insert, update, delete, truncate on public.universities from authenticated;
grant select on public.universities to authenticated;
create policy "universities: read" on public.universities for select to authenticated using (true);

-- Empty = any school.
alter table public.student_offers add column university_ids text[] not null default '{}';

alter table public.profiles add column university_id text references public.universities (id) on delete set null;
grant update (university_id) on public.profiles to authenticated;
