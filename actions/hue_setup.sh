#!/bin/bash
# Discover Philips Hue bridge on local network and create an API key.
# Press the button on your bridge BEFORE running this script.
# Outputs JSON: {"ok":true,"ip":"...","token":"..."} or {"ok":false,"error":"..."}

set -euo pipefail

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

# Fallback: scan common subnets for the bridge (looks for /api endpoint)
if [ -z "$BRIDGE_IP" ]; then
  # Get local subnet from default route
  SUBNET=$(ip route 2>/dev/null | grep "src " | head -1 | grep -o '[0-9]*\.[0-9]*\.[0-9]*\.' | head -1)
  if [ -z "$SUBNET" ]; then
    SUBNET=$(route -n get default 2>/dev/null | grep 'gateway' | grep -o '[0-9]*\.[0-9]*\.[0-9]*\.' | head -1)
  fi
  if [ -n "$SUBNET" ]; then
    for i in $(seq 1 254); do
      IP="${SUBNET}${i}"
      RESP=$(curl -sf --max-time 1 "http://${IP}/api/" 2>/dev/null || true)
      if echo "$RESP" | grep -q "Hue\|hue\|lights\|groups" 2>/dev/null; then
        BRIDGE_IP="$IP"
        break
      fi
    done
  fi
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
