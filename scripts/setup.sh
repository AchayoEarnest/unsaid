#!/bin/sh
# One-command setup: creates .env (with fresh secrets), creates the database, loads the schema.
# Usage: npm run setup            (add "-- --demo" to also load demo posts)
set -e
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i.bak "s|^DATA_KEY=.*|DATA_KEY=$(openssl rand -base64 32)|; s|^CRON_SECRET=.*|CRON_SECRET=$(openssl rand -hex 24)|" .env && rm -f .env.bak
  echo "Created .env with new secrets."
fi
URL="${DATABASE_URL:-$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')}"
[ -z "$URL" ] && { echo "DATABASE_URL is empty in .env. Example: postgres://localhost:5432/unsaid"; exit 1; }
DB="${URL##*/}"; DB="${DB%%\?*}"; ADMIN="${URL%/*}/postgres"
command -v psql >/dev/null || { echo "psql not found. Install PostgreSQL first (macOS: brew install postgresql@16 && brew services start postgresql@16)."; exit 1; }
psql "$ADMIN" -tAc "SELECT 1" >/dev/null 2>&1 || { echo "Can't reach PostgreSQL at: $ADMIN"; echo "Is it running? (macOS: brew services start postgresql@16)"; exit 1; }
if [ "$(psql "$ADMIN" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'")" != "1" ]; then
  psql "$ADMIN" -q -c "CREATE DATABASE \"$DB\"" && echo "Created database $DB."
fi
if [ "$(psql "$URL" -tAc "SELECT to_regclass('public.users')")" = "" ]; then
  for f in db/schema.sql db/002_sessions.sql db/003_age_confirmed.sql db/004_extras.sql db/seed.sql; do
    echo "Loading $f"; psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f"
  done
else
  echo "Tables already exist, leaving them alone."
fi
if [ "$1" = "--demo" ]; then psql "$URL" -v ON_ERROR_STOP=1 -q -f scripts/demo-data.sql && echo "Demo posts added."; fi
echo ""
echo "Setup complete. Next: npm run dev   (and in a second terminal: npm run ws)"
