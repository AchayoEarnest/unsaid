#!/bin/sh
. ./scripts/_url.sh
psql "$URL" -v ON_ERROR_STOP=1 -f scripts/demo-data.sql && echo "Demo posts added. Reload the app."
