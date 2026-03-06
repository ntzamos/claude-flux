#!/bin/bash
# Send an email via Resend.
# Usage: bash /home/relay/app/actions/send_email.sh <to> <subject> <body>
# Example: bash /home/relay/app/actions/send_email.sh user@example.com "Hello" "This is your bot."

TO="$1"
SUBJECT="$2"
BODY="$3"

if [ -z "$TO" ] || [ -z "$SUBJECT" ] || [ -z "$BODY" ]; then
  echo "Error: Usage: send_email.sh <to> <subject> <body>"
  exit 1
fi

API_KEY="${RESEND_API_KEY}"
FROM="${RESEND_FROM_EMAIL}"

if [ -z "$API_KEY" ] || [ -z "$FROM" ]; then
  echo "Error: RESEND_API_KEY and RESEND_FROM_EMAIL must be set"
  exit 1
fi

RESPONSE=$(curl -s -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"${FROM}\",\"to\":[\"${TO}\"],\"subject\":\"${SUBJECT}\",\"text\":\"${BODY}\"}")

EMAIL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1)
if [ -n "$EMAIL_ID" ]; then
  echo "Email sent successfully. $EMAIL_ID"
else
  echo "Error sending email: $RESPONSE"
  exit 1
fi
