#!/bin/bash
# Generate an image using Google Gemini Nano Banana API and save to /files/.
# Usage: bash /home/relay/app/actions/generate_image_nano_banana.sh "prompt" [aspect_ratio]
#   aspect_ratio: 1:1 (default), 16:9, 9:16, 4:3, 3:4

PROMPT="$1"
ASPECT_RATIO="${2:-1:1}"

if [ -z "$PROMPT" ]; then
  echo "Error: No prompt provided"
  exit 1
fi

# Get Gemini API key from DB or env
GEMINI_API_KEY="${GEMINI_API_KEY}"
if [ -z "$GEMINI_API_KEY" ] && [ -n "$DATABASE_URL" ]; then
  GEMINI_API_KEY=$(psql "$DATABASE_URL" -t -A -c "SELECT value FROM settings WHERE key='GEMINI_API_KEY' LIMIT 1" 2>/dev/null | tr -d '[:space:]')
fi

if [ -z "$GEMINI_API_KEY" ]; then
  echo "Error: GEMINI_API_KEY not found"
  exit 1
fi

MODEL="gemini-3.1-flash-image-preview"

RESPONSE=$(curl -s \
  -H "x-goog-api-key: ${GEMINI_API_KEY}" \
  -H "Content-Type: application/json" \
  -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent" \
  -d "{
    \"contents\": [{
      \"parts\": [
        {\"text\": $(echo "$PROMPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}
      ]
    }],
    \"generationConfig\": {
      \"responseModalities\": [\"TEXT\", \"IMAGE\"],
      \"imageConfig\": {
        \"aspectRatio\": \"${ASPECT_RATIO}\"
      }
    }
  }")

IMAGE_B64=$(echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
parts = d['candidates'][0]['content']['parts']
for p in parts:
    if 'inlineData' in p:
        print(p['inlineData']['data'])
        break
" 2>/dev/null)

if [ -z "$IMAGE_B64" ]; then
  ERROR=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',{}).get('message','Unknown error'))" 2>/dev/null)
  echo "Error generating image: ${ERROR:-$RESPONSE}"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="nano-banana-${TIMESTAMP}.png"
FILEPATH="/files/${FILENAME}"

echo "$IMAGE_B64" | python3 -c "import sys, base64; sys.stdout.buffer.write(base64.b64decode(sys.stdin.read().strip()))" > "$FILEPATH"

if [ ! -s "$FILEPATH" ]; then
  echo "Error: Failed to save image"
  exit 1
fi

echo "$FILEPATH"
