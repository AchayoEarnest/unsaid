#!/bin/sh
# Quick API check against a running dev server: npm run smoke
BASE="${APP_ORIGIN:-http://localhost:3000}"; J=/tmp/unsaid-smoke.jar; rm -f $J
EMAIL="smoke$(date +%s)@example.com"
t() { printf "%-34s" "$1"; shift; code=$(curl -s -o /tmp/smoke.out -w "%{http_code}" "$@"); echo "$code  $(head -c 90 /tmp/smoke.out)"; }
t "GET  /api/help?country=KE"      "$BASE/api/help?country=KE"
t "GET  /api/wall"                 "$BASE/api/wall"
t "GET  /api/community/mood"       "$BASE/api/community/mood"
t "GET  /api/posts"                "$BASE/api/posts"
t "GET  /api/search?q=tired"       "$BASE/api/search?q=tired"
t "POST /api/auth/signup"          -c $J -H "Origin: $BASE" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"correct-horse-9\",\"nickname\":\"Smoke\",\"isMinor\":false}" "$BASE/api/auth/signup"
t "GET  /api/me (signed in)"       -b $J "$BASE/api/me"
t "POST /api/posts"                -b $J -H "Origin: $BASE" -H "Content-Type: application/json" -d '{"body":"Smoke test post.","identity":"anonymous","moods":["hopeful"]}' "$BASE/api/posts"
t "POST /api/journal"              -b $J -H "Origin: $BASE" -H "Content-Type: application/json" -d '{"body":"Private smoke entry","mood":"hopeful","tags":["test"]}' "$BASE/api/journal"
t "GET  /api/journal"              -b $J "$BASE/api/journal"
t "GET  /api/journey"              -b $J "$BASE/api/journey"
t "POST /api/posts (no cookie)"    -H "Origin: $BASE" -H "Content-Type: application/json" -d '{"body":"x"}' "$BASE/api/posts"
echo "Expected: 200/201 everywhere except the last line (401)."
