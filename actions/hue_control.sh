#!/bin/bash
# Control Philips Hue lights — supports local bridge API and Hue Remote Cloud API.
# Configure credentials in Dashboard → Settings → Philips Hue.
#
# LOCAL  (same network as bridge): set HUE_BRIDGE_IP + HUE_API_KEY
# REMOTE (cloud / Railway):        set HUE_BRIDGE_ID + HUE_ACCESS_TOKEN
#
# Usage:
#   bash /app/actions/hue_control.sh on  [room|all]
#   bash /app/actions/hue_control.sh off [room|all]
#   bash /app/actions/hue_control.sh brightness <0-100> [room|all]
#   bash /app/actions/hue_control.sh color <name> [room|all]
#   bash /app/actions/hue_control.sh list
#   bash /app/actions/hue_control.sh status [room|all]
#
#   Colors: red orange yellow green cyan blue purple pink warm cool white

ACTION="${1:-help}"
ARG1="$2"
ARG2="$3"

# ── Load credentials from DB or env ──────────────────────────────
load_setting() {
  local key="$1"
  local val="${!key}"
  if [ -z "$val" ] && [ -n "$DATABASE_URL" ]; then
    val=$(psql "$DATABASE_URL" -t -A -c "SELECT value FROM settings WHERE key='$key' LIMIT 1" 2>/dev/null | tr -d '[:space:]')
  fi
  echo "$val"
}

HUE_BRIDGE_IP=$(load_setting "HUE_BRIDGE_IP")
HUE_API_KEY=$(load_setting "HUE_API_KEY")
HUE_BRIDGE_ID=$(load_setting "HUE_BRIDGE_ID")
HUE_ACCESS_TOKEN=$(load_setting "HUE_ACCESS_TOKEN")

# ── Pick API mode ─────────────────────────────────────────────────
if [ -n "$HUE_BRIDGE_IP" ] && [ -n "$HUE_API_KEY" ]; then
  MODE="local"
  BASE_URL="http://${HUE_BRIDGE_IP}/api/${HUE_API_KEY}"
elif [ -n "$HUE_BRIDGE_ID" ] && [ -n "$HUE_ACCESS_TOKEN" ]; then
  MODE="remote"
  BASE_URL="https://api.meethue.com/bridge/${HUE_BRIDGE_ID}"
else
  echo "Philips Hue is not configured. Go to Dashboard → Settings → Philips Hue."
  echo ""
  echo "LOCAL setup (bot on same network as bridge):"
  echo "  1. Press the button on your Hue bridge"
  echo "  2. Run: curl -X POST http://<bridge-ip>/api -d '{\"devicetype\":\"claude-flux\"}'"
  echo "  3. Set HUE_BRIDGE_IP and HUE_API_KEY in Settings"
  echo ""
  echo "REMOTE setup (bot on cloud / Railway):"
  echo "  1. Register a free app at https://developers.meethue.com"
  echo "  2. Run the OAuth flow to get an access token"
  echo "  3. Find your bridge ID at https://discovery.meethue.com"
  echo "  4. Set HUE_BRIDGE_ID, HUE_ACCESS_TOKEN, HUE_REFRESH_TOKEN in Settings"
  exit 1
fi

# ── HTTP helpers ──────────────────────────────────────────────────
hue_get() {
  if [ "$MODE" = "local" ]; then
    curl -sf "${BASE_URL}${1}"
  else
    curl -sf -H "Authorization: Bearer ${HUE_ACCESS_TOKEN}" "${BASE_URL}${1}"
  fi
}

hue_put() {
  if [ "$MODE" = "local" ]; then
    curl -sf -X PUT "${BASE_URL}${1}" -H "Content-Type: application/json" -d "$2"
  else
    curl -sf -X PUT -H "Authorization: Bearer ${HUE_ACCESS_TOKEN}" \
      -H "Content-Type: application/json" "${BASE_URL}${1}" -d "$2"
  fi
}

# ── Find group ID by name ─────────────────────────────────────────
find_group() {
  local name="$1"
  hue_get "/groups" | python3 -c "
import json, sys
groups = json.load(sys.stdin)
name = '$name'.lower()
for gid, g in groups.items():
    if g.get('name','').lower() == name:
        print(gid)
        break
" 2>/dev/null
}

# ── All group IDs ─────────────────────────────────────────────────
all_groups() {
  hue_get "/groups" | python3 -c "
import json, sys
[print(k) for k in json.load(sys.stdin).keys()]
" 2>/dev/null
}

# ── Apply action to a room (or all) ──────────────────────────────
apply() {
  local room="$1"
  local state="$2"
  if [ "$room" = "all" ] || [ -z "$room" ]; then
    for id in $(all_groups); do
      hue_put "/groups/${id}/action" "$state" > /dev/null
    done
  else
    local id=$(find_group "$room")
    if [ -z "$id" ]; then
      echo "Room '$room' not found. Use 'list' to see available rooms."
      exit 1
    fi
    hue_put "/groups/${id}/action" "$state" > /dev/null
  fi
}

# ── Color name → Hue API state ────────────────────────────────────
color_state() {
  case "$1" in
    red)            echo '{"on":true,"hue":0,"sat":254,"bri":254}' ;;
    orange)         echo '{"on":true,"hue":6000,"sat":254,"bri":254}' ;;
    yellow)         echo '{"on":true,"hue":12000,"sat":254,"bri":254}' ;;
    green)          echo '{"on":true,"hue":25500,"sat":254,"bri":254}' ;;
    cyan)           echo '{"on":true,"hue":40000,"sat":254,"bri":254}' ;;
    blue)           echo '{"on":true,"hue":46000,"sat":254,"bri":254}' ;;
    purple)         echo '{"on":true,"hue":51000,"sat":254,"bri":254}' ;;
    pink)           echo '{"on":true,"hue":56000,"sat":200,"bri":254}' ;;
    warm)           echo '{"on":true,"ct":400,"sat":0}' ;;
    cool)           echo '{"on":true,"ct":200,"sat":0}' ;;
    white|daylight) echo '{"on":true,"ct":230,"sat":0,"bri":254}' ;;
    *) echo "" ;;
  esac
}

# ── Commands ──────────────────────────────────────────────────────
case "$ACTION" in
  on)
    apply "${ARG1:-all}" '{"on":true}'
    echo "Lights on${ARG1:+ ($ARG1)}"
    ;;

  off)
    apply "${ARG1:-all}" '{"on":false}'
    echo "Lights off${ARG1:+ ($ARG1)}"
    ;;

  brightness)
    [ -z "$ARG1" ] && { echo "Usage: hue_control.sh brightness <0-100> [room]"; exit 1; }
    BRI=$(python3 -c "print(max(1,min(254,int(${ARG1}*254/100))))" 2>/dev/null)
    apply "${ARG2:-all}" "{\"on\":true,\"bri\":${BRI}}"
    echo "Brightness set to ${ARG1}%${ARG2:+ ($ARG2)}"
    ;;

  color)
    [ -z "$ARG1" ] && { echo "Usage: hue_control.sh color <name> [room]"; exit 1; }
    STATE=$(color_state "$ARG1")
    [ -z "$STATE" ] && { echo "Unknown color '$ARG1'. Try: red orange yellow green cyan blue purple pink warm cool white"; exit 1; }
    apply "${ARG2:-all}" "$STATE"
    echo "Color set to $ARG1${ARG2:+ ($ARG2)}"
    ;;

  list)
    hue_get "/groups" | python3 -c "
import json, sys
groups = json.load(sys.stdin)
print('Rooms / Groups:')
for gid, g in sorted(groups.items(), key=lambda x: x[1].get('name','')):
    name = g.get('name','?')
    gtype = g.get('type','')
    on = 'on' if g.get('state',{}).get('any_on') else 'off'
    print(f'  {name}  [{gtype}]  {on}')
" 2>/dev/null
    ;;

  status)
    ROOM="${ARG1:-all}"
    hue_get "/groups" | python3 -c "
import json, sys
groups = json.load(sys.stdin)
room = '$ROOM'.lower()
for gid, g in sorted(groups.items(), key=lambda x: x[1].get('name','')):
    name = g.get('name','?')
    if room != 'all' and name.lower() != room:
        continue
    state = g.get('state',{})
    action = g.get('action',{})
    on = 'ON' if state.get('any_on') else 'OFF'
    bri = int(action.get('bri',0) * 100 / 254)
    print(f'{name}: {on}  {bri}% brightness')
" 2>/dev/null
    ;;

  help|*)
    echo "Philips Hue Control  [mode: $MODE]"
    echo ""
    echo "Commands:"
    echo "  on  [room]               Turn lights on"
    echo "  off [room]               Turn lights off"
    echo "  brightness <0-100> [room]  Set brightness"
    echo "  color <name> [room]      Set color"
    echo "  list                     List all rooms"
    echo "  status [room]            Show current state"
    echo ""
    echo "Colors: red orange yellow green cyan blue purple pink warm cool white"
    echo "Omit room to affect all lights."
    ;;
esac
