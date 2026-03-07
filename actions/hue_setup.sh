#!/bin/bash
# Discover Philips Hue bridge on local network and create an API key.
# Press the button on your bridge BEFORE running this script.
# Outputs JSON: {"ok":true,"ip":"...","token":"..."} or {"ok":false,"error":"..."}

set -eo pipefail

fail() { echo "{\"ok\":false,\"error\":\"$1\"}"; exit 0; }

# ── 1. Discover bridge IP ─────────────────────────────────────
BRIDGE_IP=""

# Try Philips Hue cloud discovery first
DISCOVERY=$(curl -sf --max-time 5 "https://discovery.meethue.com/" 2>/dev/null || true)
if [ -n "$DISCOVERY" ]; then
  BRIDGE_IP=$(echo "$DISCOVERY" | grep -o '"internalipaddress":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

# Fallback: mDNS via avahi-browse (Linux)
if [ -z "$BRIDGE_IP" ] && command -v avahi-browse >/dev/null 2>&1; then
  BRIDGE_IP=$(avahi-browse -rtp _hue._tcp 2>/dev/null | grep "^=" | grep -o 'address=\[[^]]*\]' | head -1 | tr -d 'address=[]')
fi

# Fallback: scan common 192.168.x.x subnets in parallel (one subnet at a time)
if [ -z "$BRIDGE_IP" ]; then
  FOUND=$(mktemp)
  scan_subnet() {
    local prefix=$1
    for i in $(seq 1 254); do
      [ -s "$FOUND" ] && return
      RESP=$(curl -sf --max-time 0.1 "http://${prefix}.${i}/api/" 2>/dev/null || true)
      if echo "$RESP" | grep -q "Hue\|hue\|lights\|groups\|not available for resource" 2>/dev/null; then
        echo "${prefix}.${i}" > "$FOUND"
        return
      fi
    done
  }
  for second in 0 1 2 3 4 5 50 100 178 179 180; do
    scan_subnet "192.168.${second}" &
  done
  wait
  [ -s "$FOUND" ] && BRIDGE_IP=$(cat "$FOUND")
  rm -f "$FOUND"
fi

[ -z "$BRIDGE_IP" ] && fail "No Hue bridge found on the local network. Make sure you are on the same network as the bridge."

# ── 2. Create API user (requires button press) ────────────────
RESPONSE=$(curl -sf --max-time 10 -X POST \
  "http://${BRIDGE_IP}/api" \
  -H "Content-Type: application/json" \
  -d '{"devicetype":"claude-flux#bot"}' 2>/dev/null || true)

[ -z "$RESPONSE" ] && fail "Could not reach bridge at ${BRIDGE_IP}. Check the IP and try again."

# Check for link button error (type 101)
if echo "$RESPONSE" | grep -q '"type":101'; then
  fail "Bridge button not pressed. Press the button on your Hue bridge, then try again within 30 seconds."
fi

# Check for error
if echo "$RESPONSE" | grep -q '"error"'; then
  ERR=$(echo "$RESPONSE" | grep -o '"description":"[^"]*"' | head -1 | cut -d'"' -f4)
  fail "${ERR:-Unknown bridge error}"
fi

# Extract token
TOKEN=$(echo "$RESPONSE" | grep -o '"username":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -z "$TOKEN" ] && fail "Bridge responded but no token found in: $RESPONSE"

echo "{\"ok\":true,\"ip\":\"${BRIDGE_IP}\",\"token\":\"${TOKEN}\"}"
