#!/usr/bin/env bash
# One-time setup: always-on local server (systemd user service) + app-menu launcher.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node || true)"
for c in "$HOME/.local/share/mise/installs/node/latest/bin/node" /usr/bin/node /usr/local/bin/node; do
  [[ -x "$c" ]] && { NODE="$c"; break; }
done
[[ -x "$NODE" ]] || { echo "node not found" >&2; exit 1; }
mkdir -p "$HOME/.config/systemd/user" "$HOME/.local/share/applications/icons" "$DIR/data"
cat > "$HOME/.config/systemd/user/betrplayr.service" <<UNIT
[Unit]
Description=Bet-R Play-R local data server

[Service]
WorkingDirectory=$DIR
ExecStart=$NODE $DIR/server.js --port=47615
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
UNIT
cp "$DIR/icon.png" "$HOME/.local/share/applications/icons/Bet-R Play-R.png"
cat > "$HOME/.local/share/applications/Bet-R Play-R.desktop" <<DESK
[Desktop Entry]
Version=1.0
Name=Bet-R Play-R
GenericName=Betting Assistant
Comment=Bet-R Play-R workbench for Sic Bo, Teen Patti, The Kickoff, and Baccarat
Exec=$DIR/run.sh
Icon=$HOME/.local/share/applications/icons/Bet-R Play-R.png
Terminal=false
Type=Application
Categories=Game;
StartupNotify=true
StartupWMClass=chrome-127.0.0.1__-Default
Keywords=bet;betting;sicbo;teenpatti;kickoff;baccarat;casino;
DESK
chmod +x "$DIR/run.sh"
systemctl --user daemon-reload
systemctl --user enable betrplayr.service
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "Installed. Server auto-starts at login; launch Bet-R Play-R from the app menu."
