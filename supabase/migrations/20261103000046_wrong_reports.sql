-- "This is wrong": one place for every mistake a person points out (a subscription that isn't one, a money
-- move that doesn't apply, a perk their card doesn't have, a store offer that's expired). The item is hidden
-- for them straight away, and the team sees the biggest groups of mistakes to fix (aggregates only).

create table if not exists public.wrong_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('subscription', 'move', 'perk', 'store_item', 'opportunity', 'other')),
  item_key     text not null check (char_length(item_key) between 1 and 200),
  reason       text not null check (reason in ('not_mine', 'wrong_amount', 'does_not_apply', 'expired', 'other')),
  note         text check (note is null or char_length(note) <= 300),
  -- A catalog id (a card benefit, a program, a deal): not personal, so the team can count it across people.
  catalog_ref  text check (catalog_ref is null or catalog_ref ~ '^[A-Za-z0-9_:.-]{1,120}$'),
  created_at   timestamptz not null default now(),
  unique (user_id, kind, item_key)
);
create index if not exists wrong_reports_created_idx on public.wrong_reports (created_at desc);
alter table public.wrong_reports enable row level security;
revoke insert, update, delete, truncate on public.wrong_reports from anon, authenticated;
drop policy if exists "own reports: select" on public.wrong_reports;
create policy "own reports: select" on public.wrong_reports for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.report_wrong(p_kind text, p_key text, p_reason text, p_note text default null, p_catalog_ref text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.wrong_reports (user_id, kind, item_key, reason, note, catalog_ref)
  values (auth.uid(), p_kind, p_key, p_reason, nullif(left(trim(coalesce(p_note, '')), 300), ''), p_catalog_ref)
  on conflict (user_id, kind, item_key) do update set reason = excluded.reason, note = excluded.note, catalog_ref = excluded.catalog_ref, created_at = now();
end;
$$;
revoke all on function public.report_wrong(text, text, text, text, text) from public, anon;
grant execute on function public.report_wrong(text, text, text, text, text) to authenticated;

-- Changed your mind: it shows again.
create or replace function public.undo_wrong(p_kind text, p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.wrong_reports where user_id = auth.uid() and kind = p_kind and item_key = p_key;
$$;
revoke all on function public.undo_wrong(text, text) from public, anon;
grant execute on function public.undo_wrong(text, text) to authenticated;

-- For the team: what people say is wrong, by kind and reason, and the catalog entries reported by the most
-- people. Never who, never their items.
create or replace function public._quality_report(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (select * from public.wrong_reports where created_at >= now() - make_interval(days => p_days))
  select jsonb_build_object(
    'days', p_days,
    'reports', (select count(*) from r),
    'people', (select count(distinct user_id) from r),
    'by_kind', coalesce((select jsonb_object_agg(k, n) from (select kind || ':' || reason as k, count(*) as n from r group by 1) x), '{}'::jsonb),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('ref', catalog_ref, 'kind', kind, 'people', people, 'reasons', reasons) order by people desc)
      from (select catalog_ref, kind, count(distinct user_id) as people, array_agg(distinct reason) as reasons from r where catalog_ref is not null group by 1, 2 order by 3 desc limit 25) c), '[]'::jsonb)
  );
$$;
revoke all on function public._quality_report(integer) from public, anon, authenticated;
grant execute on function public._quality_report(integer) to service_role;
