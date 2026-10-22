#!/bin/sh
# Usage: npm run admin -- you@example.com   (the account must already exist)
. ./scripts/_url.sh
[ -z "$1" ] && { echo "Usage: npm run admin -- you@example.com"; exit 1; }
echo "INSERT INTO staff SELECT id,'admin' FROM users WHERE email=lower(:'e') ON CONFLICT (user_id) DO UPDATE SET role='admin' RETURNING user_id;" | psql "$URL" -v e="$1" -t | grep -q . && echo "$1 is now an admin." || echo "No account found for $1. Sign up first."
