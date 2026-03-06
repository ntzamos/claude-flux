#!/bin/bash
# Send an SMS via Twilio.
# Usage: bash /home/relay/app/actions/send_sms.sh <to> <body>
# Example: bash /home/relay/app/actions/send_sms.sh +306901234567 "Hello from your bot!"

TO="$1"
BODY="$2"

if [ -z "$TO" ] || [ -z "$BODY" ]; then
  echo "Error: Usage: send_sms.sh <to> <body>"
  exit 1
fi

ACCOUNT_SID="${TWILIO_ACCOUNT_SID}"
AUTH_TOKEN="${TWILIO_AUTH_TOKEN}"
FROM="${TWILIO_FROM_NUMBER}"

if [ -z "$ACCOUNT_SID" ] || [ -z "$AUTH_TOKEN" ] || [ -z "$FROM" ]; then
  echo "Error: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER must be set"
  exit 1
fi

RESPONSE=$(curl -s -X POST \
  "https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json" \
  -u "${ACCOUNT_SID}:${AUTH_TOKEN}" \
  --data-urlencode "To=${TO}" \
  --data-urlencode "From=${FROM}" \
  --data-urlencode "Body=${BODY}")

SID=$(echo "$RESPONSE" | grep -o '"sid":"SM[^"]*"' | head -1)
if [ -n "$SID" ]; then
  echo "SMS sent successfully. $SID"
else
  echo "Error sending SMS: $RESPONSE"
  exit 1
fi
