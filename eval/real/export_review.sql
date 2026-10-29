-- Your reviews from "Check what PerkScan read", with what PerkScan found in each email.
-- No email text is included: only the sender's domain, PerkScan's one-line summary, your verdict,
-- and the offers / receipt it saved. Run in Supabase → SQL Editor, then Export → CSV.
select
  m.sent_at::date                         as sent,
  m.received_at::date                     as received,
  m.from_domain,
  m.kind,
  m.parse_status,
  m.summary,
  f.verdict,
  array_to_string(f.wrong_fields, ', ')   as wrong,
  nullif(f.corrected::text, '{}')         as corrected,
  f.note,
  f.parser_version,
  (select string_agg(concat_ws(' | ', o.type, o.merchant, o.title, o.value_estimate::text, o.code, o.expires_at::date::text, o.valid_at, o.status), ' || ')
     from public.opportunities o
    where o.source_message_id = m.id and o.type <> 'protection') as found,
  (select string_agg(concat_ws(' | ', r.kind, r.merchant, r.total::text, r.currency, r.purchase_date::text), ' || ')
     from public.receipts r
    where r.source_message_id = m.id)                              as receipt
from public.parse_feedback f
join public.inbound_messages m on m.id = f.message_id
order by m.received_at desc;
