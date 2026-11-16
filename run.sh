#!/usr/bin/env bash
# Standalone launcher: makes sure the local data server is up (via the systemd user service
# installed by install-launcher.sh, falling back to a detached node process) and opens
# Bet-R Play-R as its own app window. Nothing else needs to be running.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=47615
URL="http://127.0.0.1:$PORT/"
mkdir -p "$DIR/data"

find_node() {
  command -v node 2>/dev/null && return
  local c
  for c in "$HOME/.local/share/mise/installs/node/latest/bin/node" "$HOME/.local/share/mise/shims/node" /usr/local/bin/node /usr/bin/node; do
    [[ -x "$c" ]] && { echo "$c"; return; }
  done
  c="$(ls -d "$HOME"/.local/share/mise/installs/node/*/bin/node 2>/dev/null | tail -n1)"
  [[ -x "$c" ]] && echo "$c"
}

is_running() {
  [[ "$(curl -fsS --max-time 1 "${URL}ping" 2>/dev/null)" == "Bet-R Play-R" ]] || return 1
  local module
  for module in history vision capture screen; do
    curl -fsS --max-time 1 "${URL}js/${module}.js" -o /dev/null 2>/dev/null || return 1
  done
}

wait_up() { local i; for i in {1..40}; do is_running && return 0; sleep 0.1; done; return 1; }

if ! is_running; then
  systemctl --user start betrplayr.service >/dev/null 2>&1 && wait_up
fi
if ! is_running; then
  NODE="$(find_node)"
  [[ -n "$NODE" ]] && setsid nohup "$NODE" "$DIR/server.js" --port="$PORT" >"$DIR/data/server.log" 2>&1 </dev/null &
  wait_up
fi
if ! is_running; then
  msg="Unable to start Bet-R Play-R on port $PORT. Check $DIR/data/server.log."
  echo "$msg" >&2
  command -v notify-send >/dev/null && notify-send "Bet-R Play-R" "$msg"
  exit 1
fi

if command -v chromium >/dev/null; then exec chromium --app="$URL" --window-size=1400,1000 --ozone-platform-hint=auto "$@"
else exec xdg-open "$URL"; fi
