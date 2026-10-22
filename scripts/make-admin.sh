#!/bin/sh
# Usage: npm run admin -- you@example.com   (the account must already exist)
. ./scripts/_url.sh
[ -z "$1" ] && { echo "Usage: npm run admin -- you@example.com"; exit 1; }
UID_FOUND=$(echo "SELECT id FROM users WHERE email=lower(:'e');" | psql "$URL" -v e="$1" -tA)
if [ -z "$UID_FOUND" ]; then
  echo "No account found for $1. Sign up first."
  exit 1
fi
echo "INSERT INTO staff SELECT id,'admin' FROM users WHERE email=lower(:'e') ON CONFLICT (user_id) DO UPDATE SET role='admin';" | psql "$URL" -v e="$1" -v ON_ERROR_STOP=1 -q && echo "$1 is now an admin."
