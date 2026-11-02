#!/usr/bin/env bash
# Opens Bet-R Play-R as its own app window and makes sure the local data server is running
# (saves to data/betrplayr.json + daily backups in data/backups/).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="file://${DIR// /%20}/index.html"
mkdir -p "$DIR/data"
if ! curl -s --max-time 1 http://127.0.0.1:47615/ping >/dev/null 2>&1; then
  nohup node "$DIR/server.js" >"$DIR/data/server.log" 2>&1 &
  sleep 0.3
fi
if command -v chromium >/dev/null; then exec chromium --app="$URL" --window-size=1400,1000
else exec xdg-open "$URL"; fi
