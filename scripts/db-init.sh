#!/bin/sh
# Reads DATABASE_URL from the environment or .env, then loads every SQL file in order.
URL="${DATABASE_URL:-$(grep '^DATABASE_URL=' .env 2>/dev/null | cut -d= -f2-)}"
[ -z "$URL" ] && { echo "Set DATABASE_URL in .env first (example: postgres://localhost:5432/unsaid)"; exit 1; }
for f in db/schema.sql db/002_sessions.sql db/003_age_confirmed.sql db/004_extras.sql db/seed.sql; do
  echo "Loading $f"; psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f" || exit 1
done
echo "Database ready."
