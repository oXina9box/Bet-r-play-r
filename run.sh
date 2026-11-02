#!/usr/bin/env bash
# Opens Bet-R Play-R as its own app window and makes sure the local data server is running
# (saves to data/betrplayr.json + daily backups in data/backups/).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="http://127.0.0.1:47615/"
mkdir -p "$DIR/data"
is_running() {
  local p
  p="$(curl -fsS --max-time 1 "${URL}ping" 2>/dev/null)"
  [[ "$p" == 'Bet-R Play-R' || "$p" == 'ok' ]]
}

if ! is_running; then
  setsid nohup node "$DIR/server.js" >"$DIR/data/server.log" 2>&1 &
  for attempt in {1..20}; do
    is_running && break
    sleep 0.1
  done
fi

if ! is_running; then
  echo 'Unable to start Bet-R Play-R. Check data/server.log. If an older server owns port 47615, stop it and rerun this launcher.' >&2
  exit 1
fi
if command -v chromium >/dev/null; then exec chromium --app="$URL" --window-size=1400,1000 --ozone-platform-hint=auto "$@"
else exec xdg-open "$URL"; fi
