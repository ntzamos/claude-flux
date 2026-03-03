#!/bin/bash
# Generate an image using OpenAI DALL-E 3 and save to /files/.
# Usage: bash /home/relay/app/actions/generate_image.sh "prompt" [size] [quality]
#   size:    1024x1024 (default), 1792x1024, 1024x1792
#   quality: standard (default), hd

PROMPT="$1"
SIZE="${2:-1024x1024}"
QUALITY="${3:-standard}"

if [ -z "$PROMPT" ]; then
  echo "Error: No prompt provided"
  exit 1
fi

# Get OpenAI API key from DB or env
OPENAI_API_KEY="${OPENAI_API_KEY}"
if [ -z "$OPENAI_API_KEY" ] && [ -n "$DATABASE_URL" ]; then
  OPENAI_API_KEY=$(psql "$DATABASE_URL" -t -A -c "SELECT value FROM settings WHERE key='OPENAI_API_KEY' LIMIT 1" 2>/dev/null | tr -d '[:space:]')
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "Error: OPENAI_API_KEY not found"
  exit 1
fi

# Call DALL-E 3 API
RESPONSE=$(curl -s https://api.openai.com/v1/images/generations \
  -H "Authorization: Bearer ${OPENAI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"dall-e-3\",
    \"prompt\": $(echo "$PROMPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
    \"n\": 1,
    \"size\": \"${SIZE}\",
    \"quality\": \"${QUALITY}\",
    \"response_format\": \"url\"
  }")

IMAGE_URL=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data'][0]['url'])" 2>/dev/null)

if [ -z "$IMAGE_URL" ]; then
  ERROR=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',{}).get('message','Unknown error'))" 2>/dev/null)
  echo "Error generating image: ${ERROR:-$RESPONSE}"
  exit 1
fi

# Save to /files/ with timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="image-${TIMESTAMP}.png"
FILEPATH="/files/${FILENAME}"

curl -s -o "$FILEPATH" "$IMAGE_URL"

if [ ! -f "$FILEPATH" ]; then
  echo "Error: Failed to download image"
  exit 1
fi

echo "$FILEPATH"
