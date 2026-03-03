#!/bin/bash
# Send an image to Telegram as an inline photo (displayed in chat).
# Usage: bash /home/relay/app/actions/send_photo_to_telegram.sh /files/image.png [optional caption]

FILE_PATH="$1"
CAPTION="${2:-}"

if [ -z "$FILE_PATH" ]; then
  echo "Error: No file path provided"
  exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
  echo "Error: File not found: $FILE_PATH"
  exit 1
fi

BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
CHAT_ID="${TELEGRAM_USER_ID}"

if [ -z "$BOT_TOKEN" ] || [ -z "$CHAT_ID" ]; then
  echo "Error: TELEGRAM_BOT_TOKEN or TELEGRAM_USER_ID not set"
  exit 1
fi

if [ -n "$CAPTION" ]; then
  RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto" \
    -F "chat_id=${CHAT_ID}" \
    -F "photo=@${FILE_PATH}" \
    -F "caption=${CAPTION}")
else
  RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto" \
    -F "chat_id=${CHAT_ID}" \
    -F "photo=@${FILE_PATH}")
fi

OK=$(echo "$RESPONSE" | grep -o '"ok":true')
if [ -n "$OK" ]; then
  echo "Photo sent to Telegram successfully."
else
  echo "Error sending photo: $RESPONSE"
  exit 1
fi
