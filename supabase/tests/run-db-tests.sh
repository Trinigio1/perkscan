#!/usr/bin/env bash
# Runs the pgTAP tests with plain psql against any database that already has the
# migrations applied. With the Supabase CLI running, `npx supabase test db` is equivalent.
# Usage: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
cd "$(dirname "$0")/database"

psql "$DB_URL" -q -c 'create extension if not exists pgtap with schema extensions;' >/dev/null
failed=0
for f in *.test.sql; do
  out=$(PGOPTIONS='--search_path=public,extensions' psql "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 -f "$f" 2>&1) || failed=1
  if grep -qE '^not ok|# Looks like|ERROR' <<<"$out"; then failed=1; fi
  echo "== $f"
  grep -E '^(ok|not ok|#)|ERROR' <<<"$out" || true
done
exit $failed
