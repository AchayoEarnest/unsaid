URL="${DATABASE_URL:-$(grep '^DATABASE_URL=' .env 2>/dev/null | cut -d= -f2-)}"
[ -z "$URL" ] && { echo "Set DATABASE_URL in .env first."; exit 1; }
