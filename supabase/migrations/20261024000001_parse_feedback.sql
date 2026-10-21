-- Accuracy tracking: users mark what PerkScan read from each email/text as right or
-- wrong, optionally fixing it. Only structured fields are kept (never message text).

-- Which version of the reader (prompt + model) read each message, so accuracy can be
-- compared when the reader changes.
alter table public.inbound_messages add column parser_version text;

create table public.parse_feedback (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  message_id     uuid not null references public.inbound_messages (id) on delete cascade,
  verdict        text not null check (verdict in ('right', 'wrong')),
  -- What was wrong. Fixed list so it can be counted.
  wrong_fields   text[] not null default '{}' check (
    wrong_fields <@ array['kind', 'merchant', 'amount', 'currency', 'code', 'expiry', 'card', 'date', 'missed', 'not_real', 'other']::text[]
  ),
  -- Corrected values the user typed (structured only: amount, code, dates, merchant, card last 4).
  corrected      jsonb not null default '{}',
  note           text check (char_length(note) <= 280),
  parser_version text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, message_id)
);

alter table public.parse_feedback enable row level security;
revoke all on public.parse_feedback from anon;
revoke insert, update, truncate on public.parse_feedback from authenticated;
grant select, delete on public.parse_feedback to authenticated;
create policy "own feedback: select" on public.parse_feedback for select to authenticated using (user_id = (select auth.uid()));
create policy "own feedback: delete" on public.parse_feedback for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Save a review of one message. With corrections, also fixes the offer or
-- purchase it produced. Writes go through here so values are validated.
-- ---------------------------------------------------------------------------
create function public.submit_parse_feedback(
  p_message_id     uuid,
  p_verdict        text,
  p_wrong_fields   text[] default '{}',
  p_corrected      jsonb default '{}',
  p_note           text default null,
  p_opportunity_id uuid default null,
  p_receipt_id     uuid default null
)
returns public.parse_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  m        public.inbound_messages;
  f        public.parse_feedback;
  fixed    jsonb := '{}';
  v_amount numeric;
  v_date   date;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into m from public.inbound_messages where id = p_message_id and user_id = auth.uid();
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_verdict not in ('right', 'wrong') then
    raise exception 'Verdict must be right or wrong' using errcode = '22023';
  end if;
  if p_verdict = 'right' and coalesce(cardinality(p_wrong_fields), 0) > 0 then
    raise exception 'A right answer has no wrong fields' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_corrected, '{}')) <> 'object' then
    raise exception 'Corrections must be an object' using errcode = '22023';
  end if;

  -- Validate each correction; unknown keys are rejected.
  if exists (select 1 from jsonb_object_keys(coalesce(p_corrected, '{}')) k
             where k not in ('amount', 'currency', 'code', 'expires_on', 'merchant', 'last_four', 'purchase_date')) then
    raise exception 'Unknown correction' using errcode = '22023';
  end if;
  if p_corrected ? 'amount' then
    v_amount := (p_corrected ->> 'amount')::numeric;
    if v_amount < 0 or v_amount > 1000000 then raise exception 'Amount out of range' using errcode = '22023'; end if;
    fixed := fixed || jsonb_build_object('amount', round(v_amount, 2));
  end if;
  if p_corrected ? 'currency' then
    if (p_corrected ->> 'currency') !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter code' using errcode = '22023'; end if;
    fixed := fixed || jsonb_build_object('currency', p_corrected ->> 'currency');
  end if;
  if p_corrected ? 'code' then
    if (p_corrected ->> 'code') !~ '^[A-Za-z0-9-]{3,40}$' then raise exception 'Codes are 3-40 letters or numbers' using errcode = '22023'; end if;
    fixed := fixed || jsonb_build_object('code', p_corrected ->> 'code');
  end if;
  if p_corrected ? 'expires_on' then
    v_date := (p_corrected ->> 'expires_on')::date;
    fixed := fixed || jsonb_build_object('expires_on', v_date);
  end if;
  if p_corrected ? 'purchase_date' then
    v_date := (p_corrected ->> 'purchase_date')::date;
    fixed := fixed || jsonb_build_object('purchase_date', v_date);
  end if;
  if p_corrected ? 'merchant' then
    if char_length(trim(p_corrected ->> 'merchant')) not between 1 and 80 then raise exception 'Merchant name is 1-80 characters' using errcode = '22023'; end if;
    fixed := fixed || jsonb_build_object('merchant', trim(p_corrected ->> 'merchant'));
  end if;
  if p_corrected ? 'last_four' then
    if (p_corrected ->> 'last_four') !~ '^[0-9]{4}$' then raise exception 'Card ending is 4 digits' using errcode = '22023'; end if;
    fixed := fixed || jsonb_build_object('last_four', p_corrected ->> 'last_four');
  end if;

  -- Fix the offer this message produced.
  if p_opportunity_id is not null then
    perform 1 from public.opportunities where id = p_opportunity_id and user_id = auth.uid() and source_message_id = p_message_id;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    update public.opportunities o set
      -- Only money-type offers carry a value; trials, returns and protections never do.
      value_estimate = case when fixed ? 'amount' and o.type in ('promo', 'gift_card', 'store_credit', 'points', 'settlement')
                            then (fixed ->> 'amount')::numeric else o.value_estimate end,
      currency       = coalesce(fixed ->> 'currency', o.currency),
      code           = coalesce(fixed ->> 'code', o.code),
      merchant       = coalesce(fixed ->> 'merchant', o.merchant),
      expires_at     = case when fixed ? 'expires_on' then ((fixed ->> 'expires_on') || 'T23:59:59Z')::timestamptz else o.expires_at end,
      -- Keep the "what to do" steps in step with a corrected code or date. Codes and
      -- ISO dates are plain [A-Za-z0-9-], so a text replace inside the JSON is safe.
      action_steps   = (
        case when fixed ? 'expires_on' and o.expires_at is not null
             then replace(
                    case when fixed ? 'code' and o.code is not null then replace(o.action_steps::text, o.code, fixed ->> 'code') else o.action_steps::text end,
                    to_char(o.expires_at at time zone 'UTC', 'YYYY-MM-DD'), fixed ->> 'expires_on')
             when fixed ? 'code' and o.code is not null then replace(o.action_steps::text, o.code, fixed ->> 'code')
             else o.action_steps::text end
      )::jsonb,
      status         = case when 'not_real' = any (p_wrong_fields) and o.status = 'open' then 'dismissed'::public.opportunity_status
                            when fixed ? 'expires_on' and o.status = 'expired' and ((fixed ->> 'expires_on') || 'T23:59:59Z')::timestamptz > now()
                              then 'open'::public.opportunity_status
                            else o.status end
    where o.id = p_opportunity_id;
  end if;

  -- Fix the purchase this message produced. A new card ending clears the card link so re-matching can redo it.
  if p_receipt_id is not null then
    perform 1 from public.receipts where id = p_receipt_id and user_id = auth.uid() and source_message_id = p_message_id;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    update public.receipts r set
      total                = coalesce((fixed ->> 'amount')::numeric, r.total),
      currency             = coalesce(fixed ->> 'currency', r.currency),
      merchant             = coalesce(fixed ->> 'merchant', r.merchant),
      purchase_date        = coalesce((fixed ->> 'purchase_date')::date, r.purchase_date),
      last_four            = coalesce(fixed ->> 'last_four', r.last_four),
      matched_user_card_id = case when fixed ? 'last_four' and fixed ->> 'last_four' is distinct from r.last_four then null else r.matched_user_card_id end
    where r.id = p_receipt_id;
  end if;

  insert into public.parse_feedback (user_id, message_id, verdict, wrong_fields, corrected, note, parser_version)
  values (auth.uid(), p_message_id, p_verdict, coalesce(p_wrong_fields, '{}'), fixed, nullif(trim(p_note), ''), m.parser_version)
  on conflict (user_id, message_id) do update set
    verdict = excluded.verdict,
    wrong_fields = excluded.wrong_fields,
    corrected = public.parse_feedback.corrected || excluded.corrected,
    note = coalesce(excluded.note, public.parse_feedback.note),
    updated_at = now()
  returning * into f;
  return f;
end;
$$;
revoke all on function public.submit_parse_feedback(uuid, text, text[], jsonb, text, uuid, uuid) from public, anon;
grant execute on function public.submit_parse_feedback(uuid, text, text[], jsonb, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The signed-in user's accuracy summary.
-- ---------------------------------------------------------------------------
create function public.my_parse_accuracy()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'read', (select count(*) from public.inbound_messages where user_id = auth.uid() and parse_status in ('parsed', 'ignored')),
    'checked', count(*),
    'right', count(*) filter (where verdict = 'right'),
    'wrong', count(*) filter (where verdict = 'wrong'),
    'fields', coalesce((
      select jsonb_object_agg(field, n) from (
        select unnest(wrong_fields) as field, count(*) as n
        from public.parse_feedback where user_id = auth.uid() group by 1
      ) x
    ), '{}'),
    'by_version', coalesce((
      select jsonb_agg(jsonb_build_object('version', coalesce(parser_version, 'before tracking'), 'checked', c, 'right', r) order by parser_version nulls first)
      from (
        select parser_version, count(*) as c, count(*) filter (where verdict = 'right') as r
        from public.parse_feedback where user_id = auth.uid() group by parser_version
      ) v
    ), '[]')
  )
  from public.parse_feedback
  where user_id = auth.uid();
$$;
revoke all on function public.my_parse_accuracy() from public, anon;
grant execute on function public.my_parse_accuracy() to authenticated;
