-- What each offer from email is about ("fitness", "beauty"), read from the email by the reader, so
-- offers can be shown under the interests people pick. Older offers have none; the app falls back
-- to what the store is known for.
alter table public.opportunities
  add column interest text
  check (interest is null or interest in (
    'groceries', 'dining', 'delivery', 'electronics', 'fashion', 'home', 'travel', 'beauty', 'fitness',
    'entertainment', 'fuel', 'kids', 'pets', 'education', 'shopping'
  ));
