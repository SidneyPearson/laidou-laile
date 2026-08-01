#!/bin/bash
# Restart citywalk dev servers as PERSISTENT launchd agents (survives session end + sleep).
#
# IMPORTANT: run this from YOUR OWN Terminal, not the agent sandbox — the agent's
# shell blocks launchctl (I/O error). In your Terminal it works:
#     bash /Users/chentao/Desktop/citywalk/scripts/restart-dev.sh
#
# Only touches citywalk's own ports (9090 vite / 3000 wrangler). It NEVER kills
# other vite projects (e.g. your localhost:5174 / data-online-demo).

set -u

AGENT_DIR="$HOME/Library/LaunchAgents"
SERVER="$AGENT_DIR/com.citywalk.server.plist"
CLIENT="$AGENT_DIR/com.citywalk.client.plist"

log() { echo "[restart-dev] $*"; }

load_one() {
  local plist="$1"
  if launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null; then
    log "bootstrapped $(basename "$plist")"
  elif launchctl load -w "$plist" 2>/dev/null; then
    log "loaded $(basename "$plist")"
  else
    log "FAILED to load $(basename "$plist") — run from your own Terminal"
  fi
}

unload_one() {
  launchctl bootout "gui/$(id -u)/com.citywalk.server" 2>/dev/null
  launchctl bootout "gui/$(id -u)/com.citywalk.client" 2>/dev/null
  launchctl unload "$1" 2>/dev/null && log "unloaded $(basename "$1")" || log "already unloaded $(basename "$1")"
}

log "stopping citywalk launchd agents"
unload_one "$SERVER"
unload_one "$CLIENT"

# Free ports directly in case launchd left orphan processes.
for p in 9090 3000; do
  pids=$(lsof -ti tcp:"$p" 2>/dev/null)
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null
    sleep 1
    pids=$(lsof -ti tcp:"$p" 2>/dev/null)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
    log "freed port $p"
  fi
done

log "loading citywalk launchd agents (persistent)"
load_one "$SERVER"
load_one "$CLIENT"

sleep 6
curl -s -o /dev/null -w "FRONTEND 9090: %{http_code}\n" --max-time 8 http://localhost:9090/
curl -s -o /dev/null -w "BACKEND 3000: %{http_code}\n" --max-time 8 http://localhost:3000/api/health
log "done. other vite projects (e.g. :5174) are untouched."
